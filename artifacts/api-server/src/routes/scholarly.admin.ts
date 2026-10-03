import {
  CreateScholarlyPassageBody,
  CreateScholarlyPassageParams,
  CreateScholarlySourceBody,
  CreateScholarlySourceResponse,
  GetScholarlyConfigResponse,
  GenerateScholarlyPreviewBody,
  GenerateScholarlyPreviewResponse,
  IndexScholarlySourceBody,
  IndexScholarlySourceParams,
  IndexScholarlySourceResponse,
  ListScholarlyAuditResponse,
  ListScholarlyIssuesQueryParams,
  ListScholarlyIssuesResponse,
  ListScholarlyPassagesParams,
  ListScholarlyPassagesResponse,
  ListScholarlySourcesResponse,
  ModerateScholarlyIssueBody,
  ModerateScholarlyIssueParams,
  ModerateScholarlyIssueResponse,
  RecordScholarlyEvaluationBody,
  RecordScholarlyEvaluationResponse,
  ReviewScholarlySourceBody,
  ReviewScholarlySourceParams,
  ReviewScholarlySourceResponse,
  UpdateScholarlyConfigBody,
  UpdateScholarlyConfigResponse,
  WithdrawScholarlySourceBody,
  WithdrawScholarlySourceParams,
  WithdrawScholarlySourceResponse,
} from "@workspace/api-zod";
import {
  db,
  scholarlyAuditTable,
  scholarlyEvaluationsTable,
  scholarlyIssuesTable,
  scholarlyPassagesTable,
  scholarlyQuestionsTable,
  scholarlyRuntimeConfigTable,
  scholarlySourcesTable,
} from "@workspace/db";
import { and, count, desc, eq, ne } from "drizzle-orm";
import { Router } from "express";
import {
  generateNvidiaScholarlyPreview,
  isScholarlyProviderConfigured,
  NVIDIA_SCHOLARLY_MODEL,
  runArabicModelEvaluation,
  ScholarlyProviderUnavailableError,
  type ScholarlyModel,
} from "../lib/scholarly";
import {
  currentScholarlyModel,
  getScholarlyCorpus,
  getScholarlyReadiness,
} from "./scholarly.readiness";
import {
  authenticationRequired,
  getQuestionCitations,
  hasOnlyKeys,
  rateLimit,
  requireAdmin,
  sameOrigin,
  type AuthedRequest,
} from "./scholarly.shared";

const adminRouter = Router();

adminRouter.post(
  "/mateen/admin/scholarly/preview",
  sameOrigin,
  authenticationRequired,
  rateLimit(5, 60_000),
  async (req: AuthedRequest, res) => {
    res.set("Cache-Control", "no-store");
    if (!await requireAdmin(req, res)) return;
    const body = GenerateScholarlyPreviewBody.safeParse(req.body);
    if (!body.success || !hasOnlyKeys(req.body, ["question"]) ||
        !body.data.question.trim() || body.data.question.trim().length < 3) {
      res.status(400).json({ error: "A question of 3–2000 characters is required" });
      return;
    }
    let answer: string;
    try {
      answer = await generateNvidiaScholarlyPreview(body.data.question.trim());
    } catch (error) {
      if (!(error instanceof ScholarlyProviderUnavailableError)) throw error;
      res.status(503).json({ error: "تعذّر توليد المسودة من NVIDIA. لم تُحفظ إجابة ولم تتغير حالة التقييم؛ حاول لاحقاً." });
      return;
    }
    // A reviewer may lose access while the external request is in flight.
    if (!await requireAdmin(req, res)) return;
    await writeAudit(req.scholarlyUserId!, "private_preview_generated", "assistant_preview", null,
      "Private unreviewed draft; not a scientific evaluation or student answer",
      { model: NVIDIA_SCHOLARLY_MODEL, sourceGrounded: false });
    res.json(GenerateScholarlyPreviewResponse.parse({
      answer,
      model: NVIDIA_SCHOLARLY_MODEL,
      reviewStatus: "unreviewed",
      sourceGrounded: false,
      generatedAt: new Date().toISOString(),
    }));
  },
);

async function writeAudit(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  reason: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(scholarlyAuditTable).values({ actorId, action, targetType, targetId, reason, details });
}

async function persistFailedEvaluation(
  actorId: string,
  model: ScholarlyModel,
  corpusHash: string,
  note: string,
): Promise<void> {
  const [evaluation] = await db.insert(scholarlyEvaluationsTable).values({
    actorId,
    model,
    corpusHash,
    arabicQualityPassed: false,
    groundingPassed: false,
    abstentionPassed: false,
    serverRunPassed: false,
    evaluationNote: note,
  }).returning();
  await writeAudit(actorId, "scholarly_evaluation_run_failed", "evaluation", evaluation.id, note, {
    model,
    corpusHash,
  });
}

async function mapSource(source: typeof scholarlySourcesTable.$inferSelect) {
  const [total] = await db.select({ count: count() }).from(scholarlyPassagesTable)
    .where(eq(scholarlyPassagesTable.sourceId, source.id));
  return {
    id: source.id,
    title: source.title,
    author: source.author,
    edition: source.edition,
    publisher: source.publisher,
    legalAuthorization: source.legalAuthorization,
    authorizationReference: source.authorizationReference,
    version: source.version,
    status: source.status,
    passageCount: total?.count ?? 0,
    reviewedAt: source.reviewedAt,
    indexedAt: source.indexedAt,
  };
}

adminRouter.get("/mateen/admin/scholarly/sources", authenticationRequired, async (req: AuthedRequest, res) => {
  if (!await requireAdmin(req, res)) return;
  const sources = await db.select().from(scholarlySourcesTable)
    .orderBy(desc(scholarlySourcesTable.createdAt)).limit(500);
  res.json(ListScholarlySourcesResponse.parse(await Promise.all(sources.map(mapSource))));
});

adminRouter.post(
  "/mateen/admin/scholarly/sources",
  sameOrigin,
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    if (!await requireAdmin(req, res)) return;
    if (!hasOnlyKeys(req.body, [
      "title", "author", "edition", "publisher", "legalAuthorization",
      "authorizationReference", "version",
    ])) {
      res.status(400).json({ error: "Unexpected source metadata fields" });
      return;
    }
    const parsed = CreateScholarlySourceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const input = parsed.data;
    if (
      !input.title.trim() || !input.author.trim() || !input.edition.trim() ||
      !input.version.trim() || !input.authorizationReference.trim()
    ) {
      res.status(400).json({ error: "Title, author, edition, version, and legal authorization reference must be non-empty" });
      return;
    }
    const [duplicate] = await db.select({ id: scholarlySourcesTable.id })
      .from(scholarlySourcesTable)
      .where(and(
        eq(scholarlySourcesTable.title, input.title),
        eq(scholarlySourcesTable.edition, input.edition),
        eq(scholarlySourcesTable.version, input.version),
      )).limit(1);
    if (duplicate) {
      res.status(409).json({ error: "A source with this edition and version already exists; source versions are immutable" });
      return;
    }
    const [source] = await db.insert(scholarlySourcesTable).values({
      title: input.title.trim(),
      author: input.author.trim(),
      edition: input.edition.trim(),
      publisher: input.publisher?.trim() || null,
      legalAuthorization: input.legalAuthorization,
      authorizationReference: input.authorizationReference.trim(),
      version: input.version.trim(),
      createdBy: req.scholarlyUserId!,
    }).returning();
    await writeAudit(req.scholarlyUserId!, "source_created", "source", source.id,
      "Source metadata and legal authorization reference recorded");
    res.status(201).json(CreateScholarlySourceResponse.parse(await mapSource(source)));
  },
);

adminRouter.get(
  "/mateen/admin/scholarly/sources/:sourceId/passages",
  authenticationRequired,
  rateLimit(30, 60_000),
  async (req: AuthedRequest, res) => {
    if (!await requireAdmin(req, res)) return;
    const params = ListScholarlyPassagesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [source] = await db.select({ id: scholarlySourcesTable.id }).from(scholarlySourcesTable)
      .where(eq(scholarlySourcesTable.id, params.data.sourceId)).limit(1);
    if (!source) {
      res.status(404).json({ error: "Source not found" });
      return;
    }
    const passages = await db.select({
      id: scholarlyPassagesTable.id,
      sourceId: scholarlyPassagesTable.sourceId,
      text: scholarlyPassagesTable.text,
      volume: scholarlyPassagesTable.volume,
      printedPage: scholarlyPassagesTable.printedPage,
      pdfPage: scholarlyPassagesTable.pdfPage,
      indexed: scholarlyPassagesTable.indexed,
    }).from(scholarlyPassagesTable)
      .where(eq(scholarlyPassagesTable.sourceId, source.id))
      .orderBy(scholarlyPassagesTable.createdAt).limit(1001);
    if (passages.length > 1000) {
      res.status(413).json({
        error: "Source has more passages than this inspection response can safely return; narrow or page the inspection request",
      });
      return;
    }
    res.json(ListScholarlyPassagesResponse.parse(passages));
  },
);

adminRouter.post(
  "/mateen/admin/scholarly/sources/:sourceId/passages",
  sameOrigin,
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    if (!await requireAdmin(req, res)) return;
    const params = CreateScholarlyPassageParams.safeParse(req.params);
    const body = CreateScholarlyPassageBody.safeParse(req.body);
    if (!params.success || !body.success || !hasOnlyKeys(req.body, ["passages"])) {
      res.status(400).json({ error: "Invalid source passage payload" });
      return;
    }
    if (body.data.passages.some((passage) => !passage.text.trim())) {
      res.status(400).json({ error: "Passage text cannot be blank" });
      return;
    }
    const source = await db.transaction(async (tx) => {
      const [lockedSource] = await tx.select().from(scholarlySourcesTable)
        .where(eq(scholarlySourcesTable.id, params.data.sourceId)).for("update").limit(1);
      if (!lockedSource || lockedSource.status !== "draft") return null;
      await tx.insert(scholarlyPassagesTable).values(body.data.passages.map((passage) => ({
        sourceId: lockedSource.id,
        text: passage.text.trim(),
        volume: passage.volume ?? null,
        printedPage: passage.printedPage ?? null,
        pdfPage: passage.pdfPage ?? null,
      })));
      return lockedSource;
    });
    if (!source) {
      res.status(409).json({ error: "Source not found or passages cannot be changed after review; create a new immutable source version" });
      return;
    }
    await writeAudit(req.scholarlyUserId!, "passages_added", "source", source.id,
      "Unreviewed source passages ingested for restricted scholarly review", {
        passageCount: body.data.passages.length,
      });
    res.status(201).end();
  },
);

adminRouter.post(
  "/mateen/admin/scholarly/sources/:sourceId/review",
  sameOrigin,
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    if (!await requireAdmin(req, res)) return;
    const params = ReviewScholarlySourceParams.safeParse(req.params);
    const body = ReviewScholarlySourceBody.safeParse(req.body);
    if (!params.success || !body.success || !hasOnlyKeys(req.body, ["decision", "note"])) {
      res.status(400).json({ error: "Invalid scholarly review decision" });
      return;
    }
    if (!body.data.note.trim()) {
      res.status(400).json({ error: "Scientific review note cannot be blank" });
      return;
    }
    const reviewResult = await db.transaction(async (tx) => {
      const [source] = await tx.select().from(scholarlySourcesTable)
        .where(eq(scholarlySourcesTable.id, params.data.sourceId)).for("update").limit(1);
      if (!source || source.status === "withdrawn") return { kind: "not-found" as const };
      if (body.data.decision === "approve" && source.createdBy === req.scholarlyUserId) {
        return { kind: "self-review" as const };
      }
      if (source.status !== "draft") return { kind: "not-draft" as const };
      const [passageCount] = await tx.select({ count: count() }).from(scholarlyPassagesTable)
        .where(eq(scholarlyPassagesTable.sourceId, source.id));
      if (!passageCount?.count ||
          body.data.decision === "approve" && !source.authorizationReference.trim()) {
        return { kind: "incomplete" as const };
      }
      const [updated] = await tx.update(scholarlySourcesTable).set({
        status: body.data.decision === "approve" ? "reviewed" : "draft",
        reviewedBy: req.scholarlyUserId!,
        reviewNote: body.data.note,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(scholarlySourcesTable.id, source.id)).returning();
      return { kind: "updated" as const, source: updated };
    });
    if (reviewResult.kind === "self-review") {
      res.status(403).json({ error: "An independent authorized content reviewer must approve this source and its reuse evidence" });
      return;
    }
    if (reviewResult.kind === "not-found") {
      res.status(404).json({ error: "Reviewable source not found" });
      return;
    }
    if (reviewResult.kind === "not-draft") {
      res.status(409).json({ error: "Only a draft source may undergo first review" });
      return;
    }
    if (reviewResult.kind === "incomplete") {
      res.status(409).json({ error: "Source needs passages and documented legal authorization before approval" });
      return;
    }
    const updated = reviewResult.source;
    await writeAudit(req.scholarlyUserId!,
      body.data.decision === "approve" ? "source_scientifically_approved" : "source_review_rejected",
      "source", updated.id, body.data.note);
    res.json(ReviewScholarlySourceResponse.parse(await mapSource(updated)));
  },
);

adminRouter.post(
  "/mateen/admin/scholarly/sources/:sourceId/index",
  sameOrigin,
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    if (!await requireAdmin(req, res)) return;
    const params = IndexScholarlySourceParams.safeParse(req.params);
    const body = IndexScholarlySourceBody.safeParse(req.body);
    if (!params.success || !body.success || !hasOnlyKeys(req.body, ["confirmReviewed"])) {
      res.status(400).json({ error: "Confirm source review before indexing" });
      return;
    }
    if (body.data.confirmReviewed !== true) {
      res.status(409).json({ error: "Only scientifically reviewed sources can be indexed" });
      return;
    }
    const indexed = await db.transaction(async (tx) => {
      const [source] = await tx.select().from(scholarlySourcesTable)
        .where(eq(scholarlySourcesTable.id, params.data.sourceId)).for("update").limit(1);
      if (!source || source.status !== "reviewed") return { kind: "not-reviewed" as const };
      const [passageCount] = await tx.select({ count: count() }).from(scholarlyPassagesTable)
        .where(eq(scholarlyPassagesTable.sourceId, source.id));
      if (!passageCount?.count) return { kind: "empty" as const };
      await tx.update(scholarlyPassagesTable).set({ indexed: true })
        .where(eq(scholarlyPassagesTable.sourceId, source.id));
      const [updated] = await tx.update(scholarlySourcesTable).set({
        status: "indexed",
        indexedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(
        eq(scholarlySourcesTable.id, source.id),
        eq(scholarlySourcesTable.status, "reviewed"),
      )).returning();
      return updated ? { kind: "indexed" as const, source: updated } : { kind: "not-reviewed" as const };
    });
    if (indexed.kind === "not-reviewed") {
      res.status(409).json({ error: "Only scientifically reviewed sources can be indexed" });
      return;
    }
    if (indexed.kind === "empty") {
      res.status(409).json({ error: "A reviewed source must contain passages before indexing" });
      return;
    }
    const source = indexed.source;
    await writeAudit(req.scholarlyUserId!, "source_indexed", "source", source.id,
      "Reviewed source indexed for lexical and semantic retrieval");
    res.json(IndexScholarlySourceResponse.parse(await mapSource(source)));
  },
);

adminRouter.post(
  "/mateen/admin/scholarly/sources/:sourceId/withdraw",
  sameOrigin,
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    if (!await requireAdmin(req, res)) return;
    const params = WithdrawScholarlySourceParams.safeParse(req.params);
    const body = WithdrawScholarlySourceBody.safeParse(req.body);
    if (!params.success || !body.success || !hasOnlyKeys(req.body, ["reason"])) {
      res.status(400).json({ error: "A source withdrawal reason is required" });
      return;
    }
    if (!body.data.reason.trim()) {
      res.status(400).json({ error: "Withdrawal reason cannot be blank" });
      return;
    }
    const [updated] = await db.transaction(async (tx) => {
      const [source] = await tx.update(scholarlySourcesTable).set({
        status: "withdrawn",
        updatedAt: new Date(),
      }).where(and(
        eq(scholarlySourcesTable.id, params.data.sourceId),
        ne(scholarlySourcesTable.status, "withdrawn"),
      )).returning();
      if (source) {
        await tx.update(scholarlyPassagesTable).set({ indexed: false })
          .where(eq(scholarlyPassagesTable.sourceId, source.id));
      }
      return [source];
    });
    if (!updated) {
      res.status(404).json({ error: "Source not found or already withdrawn" });
      return;
    }
    await writeAudit(req.scholarlyUserId!, "source_withdrawn", "source", updated.id, body.data.reason);
    res.json(WithdrawScholarlySourceResponse.parse(await mapSource(updated)));
  },
);

adminRouter.get(
  "/mateen/admin/scholarly/issues",
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    if (!await requireAdmin(req, res)) return;
    const query = ListScholarlyIssuesQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const where = query.data.status
      ? eq(scholarlyIssuesTable.status, query.data.status)
      : undefined;
    const rows = await db.select({
      issue: scholarlyIssuesTable,
      question: scholarlyQuestionsTable.question,
      answer: scholarlyQuestionsTable.answer,
    }).from(scholarlyIssuesTable)
      .innerJoin(scholarlyQuestionsTable, eq(scholarlyIssuesTable.questionId, scholarlyQuestionsTable.id))
      .where(where)
      .orderBy(desc(scholarlyIssuesTable.createdAt)).limit(300);
    res.json(ListScholarlyIssuesResponse.parse(await Promise.all(rows.map(async ({ issue, question, answer }) => ({
      ...issue,
      question,
      answer,
      citations: await getQuestionCitations(issue.questionId),
    })))));
  },
);

adminRouter.patch(
  "/mateen/admin/scholarly/issues/:issueId",
  sameOrigin,
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    if (!await requireAdmin(req, res)) return;
    const params = ModerateScholarlyIssueParams.safeParse(req.params);
    const body = ModerateScholarlyIssueBody.safeParse(req.body);
    if (!params.success || !body.success || !hasOnlyKeys(req.body, ["status", "note"])) {
      res.status(400).json({ error: "Invalid moderation decision" });
      return;
    }
    if (!body.data.note.trim()) {
      res.status(400).json({ error: "Moderation note cannot be blank" });
      return;
    }
    const [issue] = await db.update(scholarlyIssuesTable).set({
      status: body.data.status,
      moderationNote: body.data.note,
      moderatedBy: req.scholarlyUserId!,
      moderatedAt: new Date(),
    }).where(eq(scholarlyIssuesTable.id, params.data.issueId)).returning();
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    await writeAudit(req.scholarlyUserId!, "issue_moderated", "issue", issue.id, body.data.note, {
      status: body.data.status,
    });
    const [question] = await db.select().from(scholarlyQuestionsTable)
      .where(eq(scholarlyQuestionsTable.id, issue.questionId)).limit(1);
    res.json(ModerateScholarlyIssueResponse.parse({
      ...issue,
      question: question?.question ?? "",
      answer: question?.answer ?? null,
      citations: await getQuestionCitations(issue.questionId),
    }));
  },
);

adminRouter.get(
  "/mateen/admin/scholarly/config",
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    if (!await requireAdmin(req, res)) return;
    const state = await getScholarlyReadiness();
    res.json(GetScholarlyConfigResponse.parse({
      model: state.model,
      providerConfigured: state.providerConfigured,
      evaluationPassed: state.evaluationPassed,
      reviewedSourceCount: state.reviewedSourceCount,
      assistantEnabled: state.assistantEnabled,
    }));
  },
);

adminRouter.put(
  "/mateen/admin/scholarly/config",
  sameOrigin,
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    if (!await requireAdmin(req, res)) return;
    const body = UpdateScholarlyConfigBody.safeParse(req.body);
    if (!body.success || !hasOnlyKeys(req.body, ["model"])) {
      res.status(400).json({ error: "Select a supported pinned model version" });
      return;
    }
    await db.insert(scholarlyRuntimeConfigTable).values({
      id: 1,
      model: body.data.model,
      updatedBy: req.scholarlyUserId!,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: scholarlyRuntimeConfigTable.id,
      set: {
        model: body.data.model,
        updatedBy: req.scholarlyUserId!,
        updatedAt: new Date(),
      },
    });
    await writeAudit(req.scholarlyUserId!, "model_configuration_updated", "scholarly_config", "1",
      "Pinned scholarly model changed; previous model evaluation no longer enables answering", {
        model: body.data.model,
      });
    const state = await getScholarlyReadiness();
    res.json(UpdateScholarlyConfigResponse.parse({
      model: state.model,
      providerConfigured: state.providerConfigured,
      evaluationPassed: state.evaluationPassed,
      reviewedSourceCount: state.reviewedSourceCount,
      assistantEnabled: state.assistantEnabled,
    }));
  },
);

adminRouter.post(
  "/mateen/admin/scholarly/evaluations",
  sameOrigin,
  authenticationRequired,
  rateLimit(3, 60 * 60_000),
  async (req: AuthedRequest, res) => {
    if (!await requireAdmin(req, res)) return;
    const body = RecordScholarlyEvaluationBody.safeParse(req.body);
    if (!body.success || !hasOnlyKeys(req.body, [
      "model", "arabicQualityPassed", "groundingPassed", "abstentionPassed", "note",
    ])) {
      res.status(400).json({ error: "Invalid human evaluation sign-off" });
      return;
    }
    if (!body.data.note.trim()) {
      res.status(400).json({ error: "Human evaluation sign-off note cannot be blank" });
      return;
    }
    const model = await currentScholarlyModel();
    if (body.data.model !== model) {
      res.status(409).json({ error: "Evaluation model must match the pinned configuration" });
      return;
    }
    const corpus = await getScholarlyCorpus();
    if (!corpus.complete) {
      res.status(409).json({
        error: "The indexed corpus exceeds the evaluation safety limit; evaluation was not run on a truncated corpus",
      });
      return;
    }
    if (corpus.passages.length === 0) {
      await persistFailedEvaluation(
        req.scholarlyUserId!,
        model,
        corpus.hash,
        "Evaluation failed closed because no real reviewed/indexed corpus passages exist.",
      );
      res.status(409).json({ error: "Index and scientifically review real source passages before evaluation" });
      return;
    }
    if (!isScholarlyProviderConfigured(model)) {
      await persistFailedEvaluation(
        req.scholarlyUserId!,
        model,
        corpus.hash,
        "Evaluation failed closed because the configured model provider is unavailable.",
      );
      res.status(503).json({ error: "Provider is unconfigured; server evaluation did not run" });
      return;
    }
    let serverEvaluation;
    try {
      serverEvaluation = await runArabicModelEvaluation(corpus.passages, model);
    } catch (error) {
      await persistFailedEvaluation(
        req.scholarlyUserId!,
        model,
        corpus.hash,
        "Server-run Arabic retrieval, grounding, abstention, or provider evaluation failed.",
      );
      req.log.warn({
        errorType: error instanceof Error ? error.name : "UnknownError",
        corpusHash: corpus.hash,
        model,
      }, "Scholarly evaluation run failed closed");
      res.status(503).json({ error: "Server-side Arabic retrieval and grounding evaluation failed" });
      return;
    }
    const serverRunPassed = serverEvaluation.arabicQualityPassed &&
      serverEvaluation.groundingPassed && serverEvaluation.abstentionPassed;
    const [saved] = await db.insert(scholarlyEvaluationsTable).values({
      actorId: req.scholarlyUserId!,
      model,
      corpusHash: corpus.hash,
      arabicQualityPassed: body.data.arabicQualityPassed && serverEvaluation.arabicQualityPassed,
      groundingPassed: body.data.groundingPassed && serverEvaluation.groundingPassed,
      abstentionPassed: body.data.abstentionPassed && serverEvaluation.abstentionPassed,
      serverRunPassed,
      evaluationNote: `${body.data.note.trim()}\n${serverEvaluation.note}`,
    }).returning();
    await writeAudit(req.scholarlyUserId!, "scholarly_evaluation_run", "evaluation", saved.id,
      serverRunPassed ? "Server-run Arabic corpus evaluation completed" : "Server-run Arabic corpus evaluation failed",
      {
        model,
        corpusHash: corpus.hash,
        arabicQualityPassed: serverEvaluation.arabicQualityPassed,
        groundingPassed: serverEvaluation.groundingPassed,
        abstentionPassed: serverEvaluation.abstentionPassed,
      });
    const state = await getScholarlyReadiness();
    res.status(201).json(RecordScholarlyEvaluationResponse.parse({
      model: state.model,
      providerConfigured: state.providerConfigured,
      evaluationPassed: state.evaluationPassed,
      reviewedSourceCount: state.reviewedSourceCount,
      assistantEnabled: state.assistantEnabled,
    }));
  },
);

adminRouter.get(
  "/mateen/admin/scholarly/audit",
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    if (!await requireAdmin(req, res)) return;
    const rows = await db.select().from(scholarlyAuditTable)
      .orderBy(desc(scholarlyAuditTable.createdAt)).limit(500);
    res.json(ListScholarlyAuditResponse.parse(rows.map(({ id, actorId, action, targetType, targetId, reason, createdAt }) => ({
      id,
      actorId,
      action,
      targetType,
      targetId,
      reason,
      createdAt,
    }))));
  },
);

export default adminRouter;