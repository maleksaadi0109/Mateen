import {
  GetCapabilitiesResponse,
  GetCatalogResponse,
  GetDashboardResponse,
  GetProfileResponse,
  GetProgressResponse,
  GetReferralsResponse,
  GetTeacherResponse,
  GetStudyTextResponse,
  SaveProfileBody,
  SaveProfileResponse,
  SaveProgressBody,
  SaveProgressParams,
  SaveProgressResponse,
  SaveTeacherBody,
  SaveTeacherResponse,
} from "@workspace/api-zod";
import {
  db,
  profilesTable,
  studyProgressTable,
  teacherApplicationsTable,
  scholarlyReferralsTable,
  scholarlyQuestionsTable,
} from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { Router, type Response } from "express";
import nawawiRecords from "../data/nawawi.json";
import {
  authenticationRequired,
  getOrCreateProfile,
  mutationOriginProtection,
  rateLimit,
  requireProfile,
  type AuthedRequest,
} from "../lib/mateen-auth";
import { getNawawiStudyRecords } from "../lib/source-review";
import { getMateenScholarlyReadiness } from "./scholarly";
import { canonicalMatnBoundaries, canonicalMatnRecords } from "../lib/canonical-matn";
import {
  assessmentAudioCapabilitiesReady,
  recitationCapabilitiesReady,
} from "../lib/recitation-readiness";

const router = Router();

const sourceUrl = "https://app.turath.io/book/12836?page=6";
const sourceAuthor = "الإمام يحيى بن شرف النووي";
const catalogIds = new Set(["nawawi", "nawaqid", "qawaid", "tuhfa"]);
const canonicalRecordByNumber = new Map(canonicalMatnRecords.map((record) => [record.number, record]));
const canonicalBoundaryByNumber = new Map(canonicalMatnBoundaries.map((boundary) => [boundary.id, boundary]));

const validHadiths = (() => {
  if (!Array.isArray(nawawiRecords) || nawawiRecords.length === 0) {
    return [];
  }
  const ids = new Set<number>();
  const enriched = nawawiRecords.map((record) => {
    const number = typeof record === "object" && record !== null && "number" in record
      ? Number(record.number)
      : NaN;
    const canonical = canonicalRecordByNumber.get(number);
    const boundary = canonicalBoundaryByNumber.get(number);
    if (!canonical || !boundary) {
      throw new Error(`Nawawi record ${String(number)} has no explicit canonical recitation boundary.`);
    }
    return {
      ...record,
      recitationText: canonical.text,
      recitationSelection: boundary.selection,
    };
  });
  const parsed = enriched.map((record) =>
    GetStudyTextResponse.shape.hadiths.element.safeParse(record),
  );
  if (parsed.some((record) => !record.success)) {
    throw new Error("Invalid Nawawi source record schema; review the canonical text data.");
  }
  const records = parsed.map((record) => (record.success ? record.data : null));
  if (
    records.some(
      (record) =>
        !record ||
        !Number.isInteger(record.number) ||
        record.number < 1 ||
        record.number > 42 ||
        record.id !== record.number ||
        ids.has(record.number) ||
        (ids.add(record.number), false),
    )
  ) {
    throw new Error("Invalid Nawawi numbering; canonical source IDs must match hadith numbers.");
  }
  return records.filter((record) => record !== null);
})();
const hadithNumbers = new Set(validHadiths.map((record) => record.number));

const catalog = GetCatalogResponse.parse([
  {
    id: "nawawi",
    title: "الأربعون النووية",
    track: "الحديث",
    level: "التمهيدي",
    status: "available",
    description: "الأربعون النووية للإمام النووي",
    hadithCount: validHadiths.length,
  },
  {
    id: "nawaqid",
    title: "نواقض الإسلام",
    track: "العقيدة",
    level: "التمهيدي",
    status: "coming_soon",
    description: "هذا المتن مغلق حتى نشره في إصدار لاحق.",
    hadithCount: 0,
  },
  {
    id: "qawaid",
    title: "القواعد الأربع",
    track: "العقيدة",
    level: "الأول",
    status: "coming_soon",
    description: "هذا المتن مغلق حتى نشره في إصدار لاحق.",
    hadithCount: 0,
  },
  {
    id: "tuhfa",
    title: "تحفة الأطفال",
    track: "التجويد والقراءات",
    level: "التمهيدي",
    status: "coming_soon",
    description: "هذا المتن مغلق حتى نشره في إصدار لاحق.",
    hadithCount: 0,
  },
]);

function hasOnlyKeys(value: unknown, keys: string[]): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}

function validTextId(textId: string): boolean {
  return textId.length <= 64 && /^[a-z0-9-]+$/.test(textId);
}

router.use(rateLimit(120, 60_000));

router.get("/mateen/catalog", (_req, res) => {
  res.json(catalog);
});

router.get("/mateen/texts/:textId", async (req, res) => {
  const textId = req.params.textId;
  if (!validTextId(textId)) {
    res.status(400).json({ error: "Invalid text identifier" });
    return;
  }
  if (textId !== "nawawi") {
    res
      .status(catalogIds.has(textId) ? 403 : 404)
      .json({ error: catalogIds.has(textId) ? "This text is not available yet" : "Text not found" });
    return;
  }
  const reviewedSource = await getNawawiStudyRecords();
  const result = GetStudyTextResponse.parse({
    id: "nawawi",
    title: "الأربعون النووية",
    author: sourceAuthor,
    sourceUrl,
    sourceStatus: reviewedSource.sourceStatus,
    hadiths: reviewedSource.hadiths.map((record) => {
      const original = validHadiths.find((item) => item.number === record.number);
      const canonical = canonicalRecordByNumber.get(record.number);
      const boundary = canonicalBoundaryByNumber.get(record.number);
      // Preserve reviewed source metadata, but never attach an old primary
      // passage to an edited source version whose exact text no longer matches.
      const matchesCanonicalSource = original?.text.trim() === record.text.trim();
      return {
        ...record,
        recitationText: matchesCanonicalSource && canonical ? canonical.text : "",
        recitationSelection: boundary?.selection ?? "primary-report",
      };
    }),
  });
  res.json(result);
});

router.get(
  "/mateen/profile",
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    const profile = await getOrCreateProfile(req.mateenUserId!);
    if (!profile) {
      res.status(500).json({ error: "Unable to load the authenticated profile" });
      return;
    }
    res.json(
      GetProfileResponse.parse({
        id: profile.clerkId,
        name: profile.name,
        role: profile.role,
        onboarded: profile.onboarded,
        learningPreferences: profile.learningPreferences,
      }),
    );
  },
);

router.put(
  "/mateen/profile",
  mutationOriginProtection,
  rateLimit(30, 60_000),
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    if (
      !hasOnlyKeys(req.body, ["name", "role", "learningPreferences"]) ||
      (req.body?.learningPreferences != null && !hasOnlyKeys(
        req.body.learningPreferences, ["age", "memorized", "goal", "dailyMinutes"],
      )) ||
      !SaveProfileBody.safeParse(req.body).success
    ) {
      res.status(400).json({ error: "Invalid profile or learning preferences" });
      return;
    }
    const input = SaveProfileBody.parse(req.body);
    if (input.learningPreferences && (
      input.role !== "student" || !input.learningPreferences.memorized.trim()
    )) {
      res.status(400).json({ error: "Learning preferences require a student and a nonblank memorization answer" });
      return;
    }
    const name = input.name.trim();
    if (name.length < 2) {
      res.status(400).json({ error: "Name must contain at least two characters" });
      return;
    }
    await getOrCreateProfile(req.mateenUserId!);
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(profilesTable)
        .where(eq(profilesTable.clerkId, req.mateenUserId!)).for("update");
      if (!existing) return { kind: "missing" as const };
      if (existing.onboarded && existing.role !== input.role) {
        return { kind: "conflict" as const };
      }
      const [profile] = await tx.update(profilesTable)
        .set({
          name, role: existing.onboarded ? existing.role : input.role, onboarded: true,
          ...(input.learningPreferences !== undefined ? {
            learningPreferences: input.learningPreferences ? {
              ...input.learningPreferences, memorized: input.learningPreferences.memorized.trim(),
            } : null,
          } : {}),
        })
        .where(eq(profilesTable.clerkId, req.mateenUserId!))
        .returning();
      return { kind: "saved" as const, profile };
    });
    if (result.kind === "missing") {
      res.status(500).json({ error: "Unable to load the authenticated profile" });
      return;
    }
    if (result.kind === "conflict") {
      res.status(409).json({ error: "Profile role cannot be changed after onboarding" });
      return;
    }
    const profile = result.profile;
    res.json(
      SaveProfileResponse.parse({
        id: profile.clerkId,
        name: profile.name,
        role: profile.role,
        onboarded: profile.onboarded,
        learningPreferences: profile.learningPreferences,
      }),
    );
  },
);

router.get(
  "/mateen/progress",
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    const profile = await requireProfile(req, res, "student");
    if (!profile) return;
    const progress = await db
      .select()
      .from(studyProgressTable)
      .where(eq(studyProgressTable.userId, req.mateenUserId!));
    res.json(
      GetProgressResponse.parse(
        progress.map((item) => ({
          textId: item.textId,
          currentHadith: item.currentHadith,
          completedIds: item.completedIds,
          bookmarkedIds: item.bookmarkedIds,
          updatedAt: item.updatedAt.toISOString(),
        })),
      ),
    );
  },
);

router.put(
  "/mateen/progress/:textId",
  mutationOriginProtection,
  rateLimit(30, 60_000),
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    const profile = await requireProfile(req, res, "student");
    if (!profile) return;
    const params = SaveProgressParams.safeParse(req.params);
    if (!params.success || !validTextId(params.data.textId)) {
      res.status(400).json({ error: "Invalid text identifier" });
      return;
    }
    if (params.data.textId !== "nawawi") {
      res.status(catalogIds.has(params.data.textId) ? 403 : 404).json({
        error: catalogIds.has(params.data.textId)
          ? "Progress is unavailable for this text"
          : "Text not found",
      });
      return;
    }
    if (
      !hasOnlyKeys(req.body, ["currentHadith", "completedIds", "bookmarkedIds"]) ||
      !SaveProgressBody.safeParse(req.body).success
    ) {
      res.status(400).json({ error: "Invalid progress payload" });
      return;
    }
    const input = SaveProgressBody.parse(req.body);
    const allIds = [
      input.currentHadith,
      ...input.completedIds,
      ...input.bookmarkedIds,
    ];
    if (allIds.some((id) => !hadithNumbers.has(id))) {
      res.status(400).json({ error: "Progress may reference only retrieved hadith records" });
      return;
    }
    const [progress] = await db
      .insert(studyProgressTable)
      .values({
        userId: req.mateenUserId!,
        textId: params.data.textId,
        currentHadith: input.currentHadith,
        completedIds: [...new Set(input.completedIds)],
        bookmarkedIds: [...new Set(input.bookmarkedIds)],
      })
      .onConflictDoUpdate({
        target: [studyProgressTable.userId, studyProgressTable.textId],
        set: {
          currentHadith: input.currentHadith,
          completedIds: [...new Set(input.completedIds)],
          bookmarkedIds: [...new Set(input.bookmarkedIds)],
          updatedAt: new Date(),
        },
      })
      .returning();
    res.json(
      SaveProgressResponse.parse({
        textId: progress.textId,
        currentHadith: progress.currentHadith,
        completedIds: progress.completedIds,
        bookmarkedIds: progress.bookmarkedIds,
        updatedAt: progress.updatedAt.toISOString(),
      }),
    );
  },
);

router.get(
  "/mateen/dashboard",
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    const profile = await requireProfile(req, res, "student");
    if (!profile) return;
    const progress = await db
      .select()
      .from(studyProgressTable)
      .where(eq(studyProgressTable.userId, req.mateenUserId!))
      .orderBy(desc(studyProgressTable.updatedAt));
    const latest = progress[0];
    res.json(
      GetDashboardResponse.parse({
        studiedCount: progress.reduce(
          (count, item) => count + new Set(item.completedIds).size,
          0,
        ),
        totalCount: validHadiths.length,
        bookmarkedCount: progress.reduce(
          (count, item) => count + new Set(item.bookmarkedIds).size,
          0,
        ),
        lastHadith: latest?.currentHadith ?? 0,
        lastStudiedAt: latest?.updatedAt.toISOString() ?? null,
      }),
    );
  },
);

router.get(
  "/mateen/referrals",
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    const profile = await requireProfile(req, res, undefined);
    if (!profile) return;
    if (profile.role === "teacher") {
      const [application] = await db.select().from(teacherApplicationsTable)
        .where(eq(teacherApplicationsTable.userId, profile.clerkId)).limit(1);
      if (application?.status !== "approved") {
        res.status(403).json({ error: "Only approved teachers can view referrals" });
        return;
      }
    }
    const rows = await db.select({
      id: scholarlyReferralsTable.id,
      question: scholarlyQuestionsTable.question,
      reason: scholarlyQuestionsTable.reason,
      status: scholarlyReferralsTable.status,
      createdAt: scholarlyReferralsTable.createdAt,
    }).from(scholarlyReferralsTable)
      .innerJoin(scholarlyQuestionsTable, eq(scholarlyReferralsTable.questionId, scholarlyQuestionsTable.id))
      .where(profile.role === "student"
        ? eq(scholarlyQuestionsTable.studentId, profile.clerkId)
        : eq(scholarlyReferralsTable.teacherId, profile.clerkId))
      .orderBy(desc(scholarlyReferralsTable.createdAt)).limit(100);
    res.json(GetReferralsResponse.parse(rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))));
  },
);

router.post(
  "/mateen/referrals",
  mutationOriginProtection,
  rateLimit(20, 60_000),
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    const profile = await requireProfile(req, res, "student");
    if (!profile) return;
    res.status(403).json({
      error: "Direct teacher questions are not allowed. Use the consented referral of a saved abstained assistant question.",
    });
  },
);

router.get(
  "/mateen/teacher",
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    const profile = await requireProfile(req, res, "teacher");
    if (!profile) return;
    const [application] = await db
      .select()
      .from(teacherApplicationsTable)
      .where(eq(teacherApplicationsTable.userId, req.mateenUserId!))
      .limit(1);
    res.json(
      GetTeacherResponse.parse({
        biography: application?.biography ?? "",
        specialties: application?.specialties ?? "",
        available: application?.available ?? false,
        status: application?.status ?? "draft",
      }),
    );
  },
);

router.put(
  "/mateen/teacher",
  mutationOriginProtection,
  rateLimit(20, 60_000),
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    const profile = await requireProfile(req, res, "teacher");
    if (!profile) return;
    if (
      !hasOnlyKeys(req.body, ["biography", "specialties", "available"]) ||
      !SaveTeacherBody.safeParse(req.body).success
    ) {
      res.status(400).json({ error: "Invalid teacher application payload" });
      return;
    }
    const input = SaveTeacherBody.parse(req.body);
    const [existing] = await db
      .select()
      .from(teacherApplicationsTable)
      .where(eq(teacherApplicationsTable.userId, req.mateenUserId!))
      .limit(1);
    // Saving a draft is not a submission: qualification documents and the
    // administrative review workflow have not been implemented yet.
    const status = existing?.status ?? "draft";
    const [application] = await db
      .insert(teacherApplicationsTable)
      .values({
        userId: req.mateenUserId!,
        biography: input.biography,
        specialties: input.specialties,
        status,
        available: status === "approved" && input.available,
      })
      .onConflictDoUpdate({
        target: teacherApplicationsTable.userId,
        set: {
          biography: input.biography,
          specialties: input.specialties,
          status,
          available: status === "approved" && input.available,
        },
      })
      .returning();
    res.json(
      SaveTeacherResponse.parse({
        biography: application.biography,
        specialties: application.specialties,
        available: application.available,
        status: application.status,
      }),
    );
  },
);

router.get("/mateen/capabilities", async (_req, res) => {
  const reviewedSource = await getNawawiStudyRecords();
  const scholarly = await getMateenScholarlyReadiness();
  res.json(
    GetCapabilitiesResponse.parse({
      voiceReady: await recitationCapabilitiesReady(),
      assistantReady: scholarly.studyAnswersEnabled,
      examsReady: await assessmentAudioCapabilitiesReady(),
      sourceStatus: reviewedSource.sourceStatus,
      notice:
        (reviewedSource.sourceStatus === "approved"
          ? "اعتمدت النسخ الحالية علميًا ووثّقت حقوق استخدامها."
          : "لا تستخدم النسخ غير المعتمدة في التقييم؛ النص ينتظر المراجعة العلمية وتوثيق حقوق الاستخدام.") +
        (scholarly.assistantEnabled
          ? " المساعد العلمي يستشهد بالشروح المعتمدة فقط، ولا يصدر فتاوى."
           : scholarly.studyAnswersEnabled
             ? " المساعد يقدم إجابات آلية عامة غير موثّقة؛ الإجابات المسندة تنتظر اعتماد الشروح وتقييمها."
             : " تعذّر تهيئة اتصال المساعد بالنموذج؛ يمكنك إعادة المحاولة لاحقًا.") +
        " يُصحح التحريري بمطابقة حتمية، ويتطلب الشفهي مراجعة بشرية مخولة؛ لا يستخدم التعرف الآلي على الكلام للدرجات.",
    }),
  );
});

const featureUnavailable = (feature: "assistant" | "recitation") =>
  async (req: AuthedRequest, res: Response) => {
    const profile = await requireProfile(req, res, "student");
    if (!profile) return;
    res.status(503).json({
      error: `${feature} is unavailable in this release; no result was generated.`,
    });
  };

router.post(
  "/mateen/assistant",
  mutationOriginProtection,
  rateLimit(20, 60_000),
  authenticationRequired,
  (_req, res) => res.redirect(307, "/api/mateen/assistant/questions"),
);
router.post("/mateen/recitation", mutationOriginProtection, rateLimit(20, 60_000), authenticationRequired, async (req: AuthedRequest, res) => {
  const profile = await requireProfile(req, res, "student");
  if (!profile) return;
  res.status(410).json({
    error: "The legacy recitation endpoint is disabled; use /mateen/recitations.",
  });
});
export default router;