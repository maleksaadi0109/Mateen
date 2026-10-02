import { getAuth } from "@clerk/express";
import {
  GetCapabilitiesResponse,
  GetCatalogResponse,
  GetDashboardResponse,
  GetProfileResponse,
  GetProgressResponse,
  GetReferralsResponse,
  GetStudyTextResponse,
  SaveProfileBody,
  SaveProfileResponse,
  SaveProgressBody,
  SaveProgressParams,
  SaveProgressResponse,
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
import { Router, type NextFunction, type Request, type Response } from "express";
import nawawiRecords from "../data/nawawi.json";
import { getNawawiStudyRecords } from "../lib/source-review";
import { getMateenScholarlyReadiness } from "./scholarly";

const router = Router();

const sourceUrl = "https://app.turath.io/book/12836?page=6";
const sourceAuthor = "الإمام يحيى بن شرف النووي";
const catalogIds = new Set(["nawawi", "nawaqid", "qawaid", "tuhfa"]);

const validHadiths = (() => {
  if (!Array.isArray(nawawiRecords) || nawawiRecords.length === 0) {
    return [];
  }
  const ids = new Set<number>();
  const parsed = nawawiRecords.map((record) =>
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

type AuthedRequest = Request & { mateenUserId?: string };

function authenticationRequired(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): void {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication is required" });
    return;
  }
  req.mateenUserId = userId;
  next();
}

async function getOrCreateProfile(userId: string) {
  await db
    .insert(profilesTable)
    .values({ clerkId: userId, name: "", role: "student", onboarded: false })
    .onConflictDoNothing({ target: profilesTable.clerkId });
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.clerkId, userId))
    .limit(1);
  return profile;
}

async function requireProfile(
  req: AuthedRequest,
  res: Response,
  role?: "student" | "teacher",
  requireOnboarding = true,
) {
  const profile = await getOrCreateProfile(req.mateenUserId!);
  if (!profile) {
    res.status(500).json({ error: "Unable to load the authenticated profile" });
    return null;
  }
  if (requireOnboarding && !profile.onboarded) {
    res.status(403).json({ error: "Complete profile onboarding first" });
    return null;
  }
  if (role && profile.role !== role) {
    res.status(403).json({ error: `This operation requires the ${role} role` });
    return null;
  }
  return profile;
}

function mutationOriginProtection(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const origin = req.get("origin");
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const expectedHost = forwardedHost || req.get("host");
  const expectedProtocol =
    req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol;
  if (!origin || !expectedHost) {
    res.status(403).json({ error: "A same-origin request is required" });
    return;
  }
  try {
    const originUrl = new URL(origin);
    if (
      originUrl.host.toLowerCase() !== expectedHost.toLowerCase() ||
      originUrl.protocol.replace(":", "").toLowerCase() !==
        expectedProtocol.toLowerCase()
    ) {
      res.status(403).json({ error: "Cross-origin state changes are not allowed" });
      return;
    }
  } catch {
    res.status(403).json({ error: "Invalid request origin" });
    return;
  }
  next();
}

function rateLimit(limit: number, windowMs: number) {
  const requests = new Map<string, { start: number; count: number }>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = getAuth(req).userId || req.ip || req.socket.remoteAddress || "unknown";
    if (requests.size > 1000) {
      for (const [storedKey, entry] of requests) {
        if (now - entry.start >= windowMs) requests.delete(storedKey);
      }
    }
    if (!requests.has(key) && requests.size >= 10_000) {
      res.status(429).json({ error: "Too many requests; try again shortly" });
      return;
    }
    const entry = requests.get(key);
    if (!entry || now - entry.start >= windowMs) {
      requests.set(key, { start: now, count: 1 });
      next();
      return;
    }
    entry.count += 1;
    if (entry.count > limit) {
      res.status(429).json({ error: "Too many requests; try again shortly" });
      return;
    }
    next();
  };
}

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
    hadiths: reviewedSource.hadiths,
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
      !hasOnlyKeys(req.body, ["name", "role"]) ||
      !SaveProfileBody.safeParse(req.body).success
    ) {
      res.status(400).json({ error: "Expected only a valid name and student/teacher role" });
      return;
    }
    const input = SaveProfileBody.parse(req.body);
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
        .set({ name, role: existing.onboarded ? existing.role : input.role, onboarded: true })
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

router.get("/mateen/capabilities", async (_req, res) => {
  const reviewedSource = await getNawawiStudyRecords();
  const scholarly = await getMateenScholarlyReadiness();
  res.json(
    GetCapabilitiesResponse.parse({
      voiceReady: false,
      assistantReady: scholarly.assistantEnabled,
      examsReady: false,
      sourceStatus: reviewedSource.sourceStatus,
      notice:
        (reviewedSource.sourceStatus === "approved"
          ? "اعتمدت النسخ الحالية علميًا ووثّقت حقوق استخدامها."
          : "لا تستخدم النسخ غير المعتمدة في التقييم؛ النص ينتظر المراجعة العلمية وتوثيق حقوق الاستخدام.") +
        (scholarly.assistantEnabled
          ? " المساعد العلمي يستشهد بالشروح المعتمدة فقط، ولا يصدر فتاوى."
          : " الإجابات العلمية غير مفعّلة حتى اكتمال اعتماد الشروح وتهيئة النموذج واجتياز تقييم العربية والاستشهاد والامتناع.") +
        " الخدمات الصوتية والاختبارات غير متاحة حاليًا.",
    }),
  );
});

const featureUnavailable = (feature: "assistant" | "recitation" | "exams") =>
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
router.post(
  "/mateen/recitation",
  mutationOriginProtection,
  rateLimit(20, 60_000),
  authenticationRequired,
  featureUnavailable("recitation"),
);
router.post(
  "/mateen/exams",
  mutationOriginProtection,
  rateLimit(20, 60_000),
  authenticationRequired,
  featureUnavailable("exams"),
);

export default router;