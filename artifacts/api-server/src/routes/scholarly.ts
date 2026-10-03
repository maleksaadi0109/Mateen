import {
  AskMateenAssistantBody,
  AskMateenAssistantResponse,
  GetMateenAssistantQuestionsResponse,
  GetMateenConversationMessagesParams,
  GetMateenConversationMessagesResponse,
  GetMateenConversationStatusParams,
  GetMateenConversationStatusResponse,
  GetMateenConversationsResponse,
  GetMateenNotificationStateResponse,
  GetMateenNotificationsResponse,
  GetMateenReferralPreviewParams,
  GetMateenReferralPreviewResponse,
  MarkMateenNotificationReadParams,
  ReferMateenAssistantQuestionBody,
  ReferMateenAssistantQuestionParams,
  ReferMateenAssistantQuestionResponse,
  ReportScholarlyIssueBody,
  ReportScholarlyIssueResponse,
  SendMateenFollowUpBody,
  SendMateenFollowUpParams,
  SendMateenFollowUpResponse,
} from "@workspace/api-zod";
import {
  db,
  profilesTable,
  scholarlyConversationsTable,
  scholarlyIssuesTable,
  scholarlyMessagesTable,
  scholarlyNotificationsTable,
  scholarlyPassagesTable,
  scholarlyQuestionsTable,
  scholarlyReferralsTable,
  scholarlySourcesTable,
  teacherApplicationsTable,
} from "@workspace/db";
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  ne,
} from "drizzle-orm";
import { Router } from "express";
import {
  answerStudyQuestion,
  filterTeacherConversationMessages,
  isApprovedAvailableTeacher,
  requiresHumanGuidance,
  ScholarlyProviderUnavailableError,
  UNVERIFIED_STUDY_NOTICE,
} from "../lib/scholarly";
import {
  getMateenScholarlyReadiness,
  getScholarlyReadiness,
} from "./scholarly.readiness";
import teacherRoutes from "./scholarly.teacher";
import { getNawawiStudyRecords } from "../lib/source-review";
import { resolveNawawiHadith, selectNawawiReference } from "../lib/scholarly-study-context";
import adminRoutes from "./scholarly.admin";
import {
  authenticationRequired,
  getQuestionCitations,
  getProfile,
  hasOnlyKeys,
  requireApprovedTeacher,
  requireStudent,
  rateLimit,
  sameOrigin,
  type AuthedRequest,
} from "./scholarly.shared";

import { STUDY_BOOKS, USUL_STUDY_CONTEXT, isStudyBookId, studyBookId } from "../lib/scholarly-study-books";

export { getMateenScholarlyReadiness };

const router = Router();

function referralStudyContext(question: typeof scholarlyQuestionsTable.$inferSelect): string {
  return `المتن: ${STUDY_BOOKS[studyBookId(question.textId)]}${question.textContext ? `\nسياق الطالب: ${question.textContext}` : ""}`;
}

async function questionPayload(question: typeof scholarlyQuestionsTable.$inferSelect) {
  const [referral] = await db.select({
    status: scholarlyReferralsTable.status,
    teacherName: profilesTable.name,
  }).from(scholarlyReferralsTable)
    .leftJoin(profilesTable, eq(scholarlyReferralsTable.teacherId, profilesTable.clerkId))
    .where(eq(scholarlyReferralsTable.questionId, question.id)).limit(1);
  return {
    conversationId: question.conversationId,
    questionId: question.id,
    question: question.question,
    textId: studyBookId(question.textId),
    textContext: question.textContext,
    createdAt: question.createdAt,
    reason: question.reason ?? "",
    status: question.status,
    answer: question.answer,
    citations: await getQuestionCitations(question.id),
    referral: referral
      ? {
          status: referral.status === "open"
            ? "awaiting_reply"
            : referral.status === "waiting_for_teacher"
              ? "waiting_for_teacher"
              : "answered",
          teacherName: referral.teacherName,
        }
      : {
          status: "not_referred",
          teacherName: null,
        },
    model: question.model,
  };
}

async function createAssistantQuestion(
  userId: string,
  questionText: string,
  textContext: string | null,
  textId: string | null,
  existingConversationId?: string,
) {
  const gate = await getScholarlyReadiness();
  const selectedBook = studyBookId(textId);
  const isNawawi = selectedBook === "nawawi";
  const question = questionText.trim();
  let answer: string | null = null;
  let citations: Array<{
    passageId: string;
    sourceId: string;
    sourceTitle: string;
    author: string;
    edition: string;
    volume: number | null;
    printedPage: string | null;
    pdfPage: number | null;
    quote: string;
  }> = [];
  let reason = "";
  let status = "unverified";
  let providerFailed = false;
  let responseModel: string = gate.model;
  const requiredGuidance = requiresHumanGuidance(question);
  // Always generate a new explanation. References identify the passage internally;
  // they do not replace the explanation or expose private administrator drafts.
  try {
      const records = isNawawi ? (await getNawawiStudyRecords()).hadiths : [];
      const resolution = isNawawi ? resolveNawawiHadith(question, records, textContext) : null;
      const reference = resolution?.number != null
        ? selectNawawiReference(`الحديث رقم ${resolution.number}`, records)
        : null;
      const studyContext = [isNawawi ? null : USUL_STUDY_CONTEXT, reference, textContext]
        .filter(Boolean).join("\n\n") || null;
      answer = await answerStudyQuestion(question, studyContext, gate.model, STUDY_BOOKS[selectedBook]);
      citations = [];
      status = requiredGuidance ? "abstained" : "unverified";
      reason = requiredGuidance ?? UNVERIFIED_STUDY_NOTICE;
  } catch (error) {
      if (!(error instanceof ScholarlyProviderUnavailableError)) throw error;
      status = "abstained";
      reason = "تعذّر الاتصال بالنموذج أو قراءة إجابته الآن. لم تُولّد إجابة صالحة؛ أعد المحاولة أو اطلب إحالة.";
      providerFailed = true;
  }

  if (existingConversationId) {
    const [parentConversation] = await db.select({ id: scholarlyConversationsTable.id })
      .from(scholarlyConversationsTable)
      .where(and(
        eq(scholarlyConversationsTable.id, existingConversationId),
        eq(scholarlyConversationsTable.studentId, userId),
      )).limit(1);
    if (!parentConversation) return { kind: "not-found" as const };
  }
  const savedResult = await db.transaction(async (tx) => {
    // Lock every cited source and revalidate it immediately before committing
    // generated content. Withdrawal/indexing transitions lock the same rows.
    // This closes the provider-response race with source withdrawal.
    if (answer && citations.length > 0) {
      const sourceIds = [...new Set(citations.map((citation) => citation.sourceId))];
      const lockedSources = await tx.select({
        id: scholarlySourcesTable.id,
        status: scholarlySourcesTable.status,
      }).from(scholarlySourcesTable)
        .where(inArray(scholarlySourcesTable.id, sourceIds))
        .for("update");
      if (lockedSources.length !== sourceIds.length ||
          lockedSources.some((source) => source.status !== "indexed")) {
        answer = null;
        citations = [];
        status = "abstained";
        reason = "تغيّرت حالة أحد المصادر أثناء التحقق. لم تُنشر إجابة؛ يمكنك إعادة المحاولة.";
      }
    }
    // New assistant questions get private threads. An explicitly referred
    // inquiry's continuation is handled separately by the referral message
    // route, which retains the referred question/conversation association.
    const [conversation] = await tx.insert(scholarlyConversationsTable)
      .values({ studentId: userId, topic: question.slice(0, 180) })
      .returning();
    if (!conversation) return null;
    const [created] = await tx.insert(scholarlyQuestionsTable).values({
      conversationId: conversation.id,
      studentId: userId,
      question,
      textContext,
      textId: selectedBook,
      answer,
      status,
      reason: reason || null,
      model: responseModel,
      corpusHash: gate.corpus.hash,
    }).returning();
    await tx.insert(scholarlyMessagesTable).values({
      conversationId: conversation.id,
      questionId: created.id,
      senderId: userId,
      role: "student",
      text: question,
    });
    if (answer) {
      await tx.insert(scholarlyMessagesTable).values({
        conversationId: conversation.id,
        questionId: created.id,
        senderId: null,
        role: "assistant",
        text: answer,
        citations,
      });
    }
    await tx.update(scholarlyConversationsTable).set({ updatedAt: new Date() })
      .where(eq(scholarlyConversationsTable.id, conversation.id));
    return created;
  });
  if (!savedResult) return { kind: "not-found" as const };
  return {
    kind: providerFailed ? "provider-failed" as const : "saved" as const,
    question: savedResult,
  };
}

router.use(rateLimit(90, 60_000));
router.use(teacherRoutes);

router.get("/mateen/assistant/readiness", authenticationRequired, async (_req, res) => {
  res.json(await getMateenScholarlyReadiness());
});

router.get("/mateen/assistant/questions", authenticationRequired, async (req: AuthedRequest, res) => {
  if (!await requireStudent(req, res)) return;
  const questions = await db.select().from(scholarlyQuestionsTable)
    .where(eq(scholarlyQuestionsTable.studentId, req.scholarlyUserId!))
    .orderBy(desc(scholarlyQuestionsTable.createdAt)).limit(100);
  const result = await Promise.all(questions.map(questionPayload));
  res.json(GetMateenAssistantQuestionsResponse.parse(result));
});

router.post(
  "/mateen/assistant/questions",
  sameOrigin,
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    if (!await requireStudent(req, res)) return;
    if (!hasOnlyKeys(req.body, ["question", "textContext", "textId"])) {
      res.status(400).json({ error: "Unexpected assistant question fields" });
      return;
    }
    const parsed = AskMateenAssistantBody.safeParse(req.body);
    if (!parsed.success || !parsed.data.question.trim() || (parsed.data.textId != null && !isStudyBookId(parsed.data.textId))) {
      res.status(400).json({ error: "Provide a nonempty question for an available text" });
      return;
    }
    if (!parsed.data.question.trim()) {
      res.status(400).json({ error: "Question cannot be blank" });
      return;
    }
    const saved = await createAssistantQuestion(
      req.scholarlyUserId!,
      parsed.data.question,
      parsed.data.textContext ?? null,
      parsed.data.textId ?? null,
    );
    if (saved.kind === "provider-failed") {
      res.status(503).json({
        error: "The scholarly assistant is currently unavailable. Your question was privately saved without generating an answer.",
        questionId: saved.question.id,
      });
      return;
    }
    if (saved.kind !== "saved") {
      res.status(500).json({ error: "Unable to persist the assistant question" });
      return;
    }
    res.status(201).json(AskMateenAssistantResponse.parse(await questionPayload(saved.question)));
  },
);

router.get(
  "/mateen/assistant/questions/:questionId/referral-preview",
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    if (!await requireStudent(req, res)) return;
    const params = GetMateenReferralPreviewParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [question] = await db.select().from(scholarlyQuestionsTable)
      .where(and(
        eq(scholarlyQuestionsTable.id, params.data.questionId),
        eq(scholarlyQuestionsTable.studentId, req.scholarlyUserId!),
        eq(scholarlyQuestionsTable.status, "abstained"),
      )).limit(1);
    if (!question) {
      res.status(404).json({ error: "Only your persisted abstained assistant questions may be referred" });
      return;
    }
    const [alreadyReferred] = await db.select({
      id: scholarlyReferralsTable.id,
      status: scholarlyReferralsTable.status,
    })
      .from(scholarlyReferralsTable)
      .where(eq(scholarlyReferralsTable.questionId, question.id)).limit(1);
    if (alreadyReferred && alreadyReferred.status !== "waiting_for_teacher") {
      res.status(409).json({ error: "This question already has a referral" });
      return;
    }
    const teachers = await db.select({
      id: profilesTable.clerkId,
      name: profilesTable.name,
      specialties: teacherApplicationsTable.specialties,
    }).from(teacherApplicationsTable)
      .innerJoin(profilesTable, eq(teacherApplicationsTable.userId, profilesTable.clerkId))
      .where(and(
        eq(teacherApplicationsTable.status, "approved"),
        eq(teacherApplicationsTable.available, true),
        eq(profilesTable.role, "teacher"),
      ))
      .orderBy(profilesTable.name);
    res.json(GetMateenReferralPreviewResponse.parse({
      questionId: question.id,
      question: question.question,
      textContext: referralStudyContext(question),
      reason: question.reason ?? "المساعد لم يجد دليلًا كافيًا.",
      shares: [
        question.question,
        referralStudyContext(question),
      ],
      teachers,
    }));
  },
);

router.post(
  "/mateen/assistant/questions/:questionId/referral",
  sameOrigin,
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    if (!await requireStudent(req, res)) return;
    const params = ReferMateenAssistantQuestionParams.safeParse(req.params);
    const body = ReferMateenAssistantQuestionBody.safeParse(req.body);
    if (!params.success || !body.success || !hasOnlyKeys(req.body, ["consent", "teacherId"])) {
      res.status(400).json({ error: "Explicit consent and a valid teacher choice are required" });
      return;
    }
    if (body.data.consent !== true) {
      res.status(400).json({ error: "Referral requires explicit consent after reviewing the share preview" });
      return;
    }
    const created = await db.transaction(async (tx) => {
      const [question] = await tx.select().from(scholarlyQuestionsTable)
        .where(and(
          eq(scholarlyQuestionsTable.id, params.data.questionId),
          eq(scholarlyQuestionsTable.studentId, req.scholarlyUserId!),
          eq(scholarlyQuestionsTable.status, "abstained"),
        )).for("update").limit(1);
      if (!question) return { kind: "not-found" as const };
      const [existing] = await tx.select().from(scholarlyReferralsTable)
        .where(eq(scholarlyReferralsTable.questionId, question.id)).limit(1);
      if (existing && existing.status !== "waiting_for_teacher") {
        return { kind: "duplicate" as const };
      }
      const chosen = body.data.teacherId
        ? await tx.select({
            id: profilesTable.clerkId,
            name: profilesTable.name,
            specialties: teacherApplicationsTable.specialties,
            status: teacherApplicationsTable.status,
            available: teacherApplicationsTable.available,
          }).from(teacherApplicationsTable)
            .innerJoin(profilesTable, eq(teacherApplicationsTable.userId, profilesTable.clerkId))
            .where(and(
              eq(teacherApplicationsTable.userId, body.data.teacherId),
              eq(teacherApplicationsTable.status, "approved"),
              eq(teacherApplicationsTable.available, true),
              eq(profilesTable.role, "teacher"),
            )).for("update").limit(1)
        : await tx.select({
            id: profilesTable.clerkId,
            name: profilesTable.name,
            specialties: teacherApplicationsTable.specialties,
            status: teacherApplicationsTable.status,
            available: teacherApplicationsTable.available,
          }).from(teacherApplicationsTable)
            .innerJoin(profilesTable, eq(teacherApplicationsTable.userId, profilesTable.clerkId))
            .where(and(
              eq(teacherApplicationsTable.status, "approved"),
              eq(teacherApplicationsTable.available, true),
              eq(profilesTable.role, "teacher"),
            )).orderBy(profilesTable.name).for("update").limit(1);
      const teacher = chosen[0];
      const availableTeacher = teacher && isApprovedAvailableTeacher(teacher.status, teacher.available)
        ? teacher
        : null;
      if (!availableTeacher && body.data.teacherId) {
        return { kind: "unavailable" as const };
      }
      const [referral] = existing
        ? await tx.update(scholarlyReferralsTable).set({
            teacherId: availableTeacher?.id ?? null,
            status: availableTeacher ? "open" : "waiting_for_teacher",
            updatedAt: new Date(),
          }).where(eq(scholarlyReferralsTable.id, existing.id)).returning()
        : await tx.insert(scholarlyReferralsTable).values({
            conversationId: question.conversationId,
            questionId: question.id,
            studentId: req.scholarlyUserId!,
            teacherId: availableTeacher?.id ?? null,
            reason: question.reason ?? "المساعد لم يجد دليلًا كافيًا.",
            contextShared: referralStudyContext(question),
            status: availableTeacher ? "open" : "waiting_for_teacher",
          }).returning();
      if (!availableTeacher) {
        return {
          kind: "waiting" as const,
          referral,
          teacherName: null,
        };
      }
      await tx.insert(scholarlyNotificationsTable).values({
        userId: availableTeacher.id,
        conversationId: question.conversationId,
        type: "teacher_referral",
        text: "لديك إحالة علمية جديدة من المساعد.",
      });
      await tx.update(scholarlyConversationsTable)
        .set({ status: "referred", updatedAt: new Date() })
        .where(eq(scholarlyConversationsTable.id, question.conversationId));
      return { kind: "created" as const, referral, teacherName: availableTeacher.name };
    });
    if (created.kind === "not-found") {
      res.status(404).json({ error: "Only your persisted abstained assistant questions may be referred" });
      return;
    }
    if (created.kind === "duplicate") {
      res.status(409).json({ error: "This question already has a referral" });
      return;
    }
    if (created.kind === "unavailable") {
      res.status(409).json({ error: "The selected teacher is no longer approved and available; no referral was shared" });
      return;
    }
    res.status(201).json(ReferMateenAssistantQuestionResponse.parse({
      status: created.kind === "waiting" ? "waiting_for_teacher" : "awaiting_reply",
      teacherName: created.teacherName,
    }));
  },
);

router.get("/mateen/conversations", authenticationRequired, async (req: AuthedRequest, res) => {
  const profile = await getProfile(req.scholarlyUserId!);
  if (!profile) {
    res.status(403).json({ error: "An onboarded profile is required" });
    return;
  }
  if (profile.role === "teacher" &&
      !await requireApprovedTeacher(req.scholarlyUserId!, res)) return;
  const rows = await db.selectDistinct({
        id: scholarlyConversationsTable.id,
        topic: scholarlyConversationsTable.topic,
        status: scholarlyReferralsTable.status,
        updatedAt: scholarlyConversationsTable.updatedAt,
      }).from(scholarlyConversationsTable)
        .innerJoin(scholarlyReferralsTable, eq(scholarlyConversationsTable.id, scholarlyReferralsTable.conversationId))
        .where(profile.role === "student"
          ? eq(scholarlyConversationsTable.studentId, req.scholarlyUserId!)
          : eq(scholarlyReferralsTable.teacherId, req.scholarlyUserId!))
        .orderBy(desc(scholarlyConversationsTable.updatedAt)).limit(100);
  res.json(GetMateenConversationsResponse.parse(rows.map((row) => ({
    id: row.id,
    topic: row.topic,
    status: row.status === "open" ? "awaiting_reply" : row.status,
    updatedAt: row.updatedAt,
  }))));
});

async function hasConversationAccess(userId: string, conversationId: string): Promise<boolean> {
  const [profile] = await db.select({ role: profilesTable.role }).from(profilesTable)
    .where(eq(profilesTable.clerkId, userId)).limit(1);
  if (profile?.role === "student") {
    const [conversation] = await db.select({ id: scholarlyConversationsTable.id })
      .from(scholarlyConversationsTable)
      .where(and(
        eq(scholarlyConversationsTable.id, conversationId),
        eq(scholarlyConversationsTable.studentId, userId),
      )).limit(1);
    return Boolean(conversation);
  }
  const [application] = await db.select({ status: teacherApplicationsTable.status })
    .from(teacherApplicationsTable)
    .where(eq(teacherApplicationsTable.userId, userId)).limit(1);
  if (profile?.role !== "teacher" || application?.status !== "approved") return false;
  const [referral] = await db.select({ id: scholarlyReferralsTable.id })
    .from(scholarlyReferralsTable)
    .where(and(
      eq(scholarlyReferralsTable.conversationId, conversationId),
      eq(scholarlyReferralsTable.teacherId, userId),
    )).limit(1);
  return Boolean(referral);
}

router.get(
  "/mateen/conversations/:conversationId/messages",
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    const params = GetMateenConversationMessagesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!await hasConversationAccess(req.scholarlyUserId!, params.data.conversationId)) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const profile = await getProfile(req.scholarlyUserId!);
    let referredQuestionId: string | null = null;
    if (profile?.role === "teacher") {
      const [referral] = await db.select({ questionId: scholarlyReferralsTable.questionId })
        .from(scholarlyReferralsTable)
        .where(and(
          eq(scholarlyReferralsTable.conversationId, params.data.conversationId),
          eq(scholarlyReferralsTable.teacherId, req.scholarlyUserId!),
        )).limit(1);
      referredQuestionId = referral?.questionId ?? null;
    }
    const rows = await db.select().from(scholarlyMessagesTable)
      .where(eq(scholarlyMessagesTable.conversationId, params.data.conversationId))
      .orderBy(scholarlyMessagesTable.createdAt).limit(300);
    const visibleRows = profile?.role === "teacher"
      ? referredQuestionId
        ? filterTeacherConversationMessages(rows, referredQuestionId)
        : []
      : rows;
    res.json(GetMateenConversationMessagesResponse.parse(visibleRows.map((row) => ({
      id: row.id,
      role: row.role,
      text: row.text,
      createdAt: row.createdAt,
      citations: row.citations,
    }))));
  },
);

router.post(
  "/mateen/conversations/:conversationId/messages",
  sameOrigin,
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    const params = SendMateenFollowUpParams.safeParse(req.params);
    const body = SendMateenFollowUpBody.safeParse(req.body);
    if (!params.success || !body.success || !hasOnlyKeys(req.body, ["text", "requestId"])) {
      res.status(400).json({ error: "Invalid text-only assistant follow-up" });
      return;
    }
    if (!body.data.text.trim()) {
      res.status(400).json({ error: "Follow-up cannot be blank" });
      return;
    }
    if (!await requireStudent(req, res)) return;
    if (!body.data.text.trim()) {
      res.status(400).json({ error: "A nonempty text reply is required" });
      return;
    }
    const [owned] = await db.select().from(scholarlyConversationsTable)
      .where(and(eq(scholarlyConversationsTable.id, params.data.conversationId), eq(scholarlyConversationsTable.studentId, req.scholarlyUserId!))).limit(1);
    if (!owned) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const [referral] = await db.select().from(scholarlyReferralsTable)
      .where(eq(scholarlyReferralsTable.conversationId, owned.id)).limit(1);
    if (referral?.teacherId) {
      if (referral.status === "closed") {
        res.status(409).json({ error: "This referral is closed" });
        return;
      }
      const [teacher] = await db.select({ status: teacherApplicationsTable.status })
        .from(teacherApplicationsTable)
        .where(eq(teacherApplicationsTable.userId, referral.teacherId)).limit(1);
      if (teacher?.status !== "approved") {
        res.status(409).json({ error: "The assigned teacher is no longer approved" });
        return;
      }
      const accepted = await db.transaction(async (tx) => {
        const [created] = await tx.insert(scholarlyMessagesTable).values({
          id: body.data.requestId,
          conversationId: owned.id, questionId: referral.questionId,
          senderId: req.scholarlyUserId!, role: "student", text: body.data.text.trim(), citations: [],
        }).onConflictDoNothing().returning();
        if (!created) {
          if (!body.data.requestId) return false;
          const [previous] = await tx.select().from(scholarlyMessagesTable).where(and(
            eq(scholarlyMessagesTable.id, body.data.requestId),
            eq(scholarlyMessagesTable.senderId, req.scholarlyUserId!),
            eq(scholarlyMessagesTable.conversationId, owned.id),
            eq(scholarlyMessagesTable.text, body.data.text.trim()),
          )).limit(1);
          return Boolean(previous);
        }
        await tx.update(scholarlyReferralsTable).set({ status: "open", updatedAt: new Date() }).where(eq(scholarlyReferralsTable.id, referral.id));
        await tx.update(scholarlyConversationsTable).set({ status: "referred", updatedAt: new Date() }).where(eq(scholarlyConversationsTable.id, owned.id));
        await tx.insert(scholarlyNotificationsTable).values({
          userId: referral.teacherId!, conversationId: owned.id, type: "student_reply", text: "وصل رد نصي في إحالة قائمة.",
        });
        return true;
      });
      if (!accepted) {
        res.status(409).json({ error: "The message identifier was already used for different content" });
        return;
      }
      const [question] = await db.select().from(scholarlyQuestionsTable).where(eq(scholarlyQuestionsTable.id, referral.questionId)).limit(1);
      res.status(201).json(SendMateenFollowUpResponse.parse(await questionPayload(question!)));
      return;
    }
    const [latestQuestion] = await db.select({ textId: scholarlyQuestionsTable.textId })
      .from(scholarlyQuestionsTable)
      .where(and(
        eq(scholarlyQuestionsTable.conversationId, owned.id),
        eq(scholarlyQuestionsTable.studentId, req.scholarlyUserId!),
      )).orderBy(desc(scholarlyQuestionsTable.createdAt)).limit(1);
    const saved = await createAssistantQuestion(
      req.scholarlyUserId!,
      body.data.text,
      null,
      latestQuestion?.textId ?? null,
      params.data.conversationId,
    );
    if (saved.kind === "not-found") {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    if (saved.kind === "provider-failed") {
      res.status(503).json({
        error: "The scholarly assistant is currently unavailable. Your message was saved without generating an answer.",
        questionId: saved.question.id,
      });
      return;
    }
    res.status(201).json(SendMateenFollowUpResponse.parse(await questionPayload(saved.question)));
  },
);

router.get(
  "/mateen/conversations/:conversationId/status",
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    const params = GetMateenConversationStatusParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const profile = await getProfile(req.scholarlyUserId!);
    if (!await hasConversationAccess(req.scholarlyUserId!, params.data.conversationId)) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const [conversation] = await db.select().from(scholarlyConversationsTable)
      .where(eq(scholarlyConversationsTable.id, params.data.conversationId)).limit(1);
    const [referral] = await db.select({
      status: scholarlyReferralsTable.status,
      name: profilesTable.name,
    }).from(scholarlyReferralsTable)
      .leftJoin(profilesTable, eq(scholarlyReferralsTable.teacherId, profilesTable.clerkId))
      .where(and(
        eq(scholarlyReferralsTable.conversationId, params.data.conversationId),
        ...(profile?.role === "teacher"
          ? [eq(scholarlyReferralsTable.teacherId, req.scholarlyUserId!)]
          : []),
      )).limit(1);
    res.json(GetMateenConversationStatusResponse.parse({
      conversationId: conversation!.id,
      status: conversation!.status,
      referral: referral
        ? {
            status: referral.status === "open"
              ? "awaiting_reply"
              : referral.status === "waiting_for_teacher"
                ? "waiting_for_teacher"
                : "answered",
            teacherName: referral.name,
          }
        : { status: "not_referred", teacherName: null },
      updatedAt: conversation!.updatedAt,
    }));
  },
);

router.get("/mateen/notifications", authenticationRequired, async (req: AuthedRequest, res) => {
  const rows = await db.select().from(scholarlyNotificationsTable)
    .where(eq(scholarlyNotificationsTable.userId, req.scholarlyUserId!))
    .orderBy(desc(scholarlyNotificationsTable.createdAt)).limit(100);
  res.json(GetMateenNotificationsResponse.parse(rows.map((row) => ({
    id: row.id,
    type: row.type,
    conversationId: row.conversationId,
    text: row.text,
    createdAt: row.createdAt,
    readAt: row.readAt,
  }))));
});

router.get("/mateen/notifications/state", authenticationRequired, async (req: AuthedRequest, res) => {
  const [state] = await db.select({
    unreadCount: count(),
  }).from(scholarlyNotificationsTable)
    .where(and(
      eq(scholarlyNotificationsTable.userId, req.scholarlyUserId!),
      isNull(scholarlyNotificationsTable.readAt),
    ));
  const [latest] = await db.select({ createdAt: scholarlyNotificationsTable.createdAt })
    .from(scholarlyNotificationsTable)
    .where(eq(scholarlyNotificationsTable.userId, req.scholarlyUserId!))
    .orderBy(desc(scholarlyNotificationsTable.createdAt)).limit(1);
  res.json(GetMateenNotificationStateResponse.parse({
    unreadCount: state?.unreadCount ?? 0,
    latestAt: latest?.createdAt ?? null,
  }));
});

router.patch(
  "/mateen/notifications/:notificationId/read",
  sameOrigin,
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    const params = MarkMateenNotificationReadParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [updated] = await db.update(scholarlyNotificationsTable)
      .set({ readAt: new Date() })
      .where(and(
        eq(scholarlyNotificationsTable.id, params.data.notificationId),
        eq(scholarlyNotificationsTable.userId, req.scholarlyUserId!),
      )).returning();
    if (!updated) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    const [state] = await db.select({ unreadCount: count() }).from(scholarlyNotificationsTable)
      .where(and(
        eq(scholarlyNotificationsTable.userId, req.scholarlyUserId!),
        isNull(scholarlyNotificationsTable.readAt),
      ));
    const [latest] = await db.select({ createdAt: scholarlyNotificationsTable.createdAt })
      .from(scholarlyNotificationsTable)
      .where(eq(scholarlyNotificationsTable.userId, req.scholarlyUserId!))
      .orderBy(desc(scholarlyNotificationsTable.createdAt)).limit(1);
    res.json(GetMateenNotificationStateResponse.parse({
      unreadCount: state?.unreadCount ?? 0,
      latestAt: latest?.createdAt ?? null,
    }));
  },
);

router.use(adminRoutes);

router.post(
  "/mateen/assistant/issues",
  sameOrigin,
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    if (!await requireStudent(req, res)) return;
    const body = ReportScholarlyIssueBody.safeParse(req.body);
    if (!body.success || !hasOnlyKeys(req.body, ["questionId", "category", "description"])) {
      res.status(400).json({ error: "Invalid answer issue report" });
      return;
    }
    if (!body.data.description.trim()) {
      res.status(400).json({ error: "Issue description cannot be blank" });
      return;
    }
    if (!body.data.description.trim()) {
      res.status(400).json({ error: "Issue description cannot be blank" });
      return;
    }
    const [question] = await db.select().from(scholarlyQuestionsTable)
      .where(and(
        eq(scholarlyQuestionsTable.id, body.data.questionId),
        eq(scholarlyQuestionsTable.studentId, req.scholarlyUserId!),
      )).limit(1);
    if (!question) {
      res.status(404).json({ error: "Question not found" });
      return;
    }
    const [issue] = await db.insert(scholarlyIssuesTable).values({
      questionId: question.id,
      reporterId: req.scholarlyUserId!,
      category: body.data.category,
      description: body.data.description,
    }).returning();
    res.status(201).json(ReportScholarlyIssueResponse.parse({
      ...issue,
      question: question.question,
      answer: question.answer,
      citations: await getQuestionCitations(question.id),
    }));
  },
);

export default router;