import {
  GetMateenTeacherReferralsQueryParams,
  GetMateenTeacherReferralsResponse,
  ReplyMateenReferralBody,
  ReplyMateenReferralParams,
  ReplyMateenReferralResponse,
  UpdateMateenReferralStatusBody,
  UpdateMateenReferralStatusParams,
  UpdateMateenReferralStatusResponse,
} from "@workspace/api-zod";
import {
  db,
  profilesTable,
  scholarlyConversationsTable,
  scholarlyMessagesTable,
  scholarlyNotificationsTable,
  scholarlyQuestionsTable,
  scholarlyReferralsTable,
} from "@workspace/db";
import { and, desc, eq, ne } from "drizzle-orm";
import { Router } from "express";
import {
  authenticationRequired,
  hasOnlyKeys,
  requireApprovedTeacher,
  sameOrigin,
  type AuthedRequest,
} from "./scholarly.shared";

const router = Router();

router.get(
  "/mateen/teacher/referrals",
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    if (!await requireApprovedTeacher(req.scholarlyUserId!, res)) return;
    const query = GetMateenTeacherReferralsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const predicates = [eq(scholarlyReferralsTable.teacherId, req.scholarlyUserId!)];
    if (query.data.status) predicates.push(eq(scholarlyReferralsTable.status, query.data.status));
    const rows = await db.select({
      id: scholarlyReferralsTable.id,
      conversationId: scholarlyReferralsTable.conversationId,
      question: scholarlyQuestionsTable.question,
      context: scholarlyReferralsTable.contextShared,
      reason: scholarlyReferralsTable.reason,
      status: scholarlyReferralsTable.status,
      createdAt: scholarlyReferralsTable.createdAt,
    }).from(scholarlyReferralsTable)
      .innerJoin(scholarlyQuestionsTable, eq(scholarlyReferralsTable.questionId, scholarlyQuestionsTable.id))
      .where(and(...predicates))
      .orderBy(desc(scholarlyReferralsTable.createdAt)).limit(200);
    const filtered = query.data.q
      ? rows.filter((row) =>
          `${row.question} ${row.context ?? ""}`.toLocaleLowerCase()
            .includes(query.data.q!.toLocaleLowerCase()),
        )
      : rows;
    res.json(GetMateenTeacherReferralsResponse.parse(filtered.map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      question: row.question,
      context: row.context,
      reason: row.reason,
      status: row.status,
      createdAt: row.createdAt,
    }))));
  },
);

router.patch(
  "/mateen/teacher/referrals/:referralId/status",
  sameOrigin,
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    if (!await requireApprovedTeacher(req.scholarlyUserId!, res)) return;
    const params = UpdateMateenReferralStatusParams.safeParse(req.params);
    const body = UpdateMateenReferralStatusBody.safeParse(req.body);
    if (!params.success || !body.success || !hasOnlyKeys(req.body, ["status"])) {
      res.status(400).json({ error: "Invalid referral status" });
      return;
    }
    const [updated] = await db.update(scholarlyReferralsTable)
      .set({ status: body.data.status, updatedAt: new Date() })
      .where(and(
        eq(scholarlyReferralsTable.id, params.data.referralId),
        eq(scholarlyReferralsTable.teacherId, req.scholarlyUserId!),
      )).returning();
    if (!updated) {
      res.status(404).json({ error: "Referral not found" });
      return;
    }
    await db.update(scholarlyConversationsTable)
      .set({ status: body.data.status === "closed" ? "closed" : "referred", updatedAt: new Date() })
      .where(eq(scholarlyConversationsTable.id, updated.conversationId));
    const [question] = await db.select().from(scholarlyQuestionsTable)
      .where(eq(scholarlyQuestionsTable.id, updated.questionId)).limit(1);
    const [student] = await db.select({ name: profilesTable.name }).from(profilesTable)
      .where(eq(profilesTable.clerkId, updated.studentId)).limit(1);
    await db.insert(scholarlyNotificationsTable).values({
      userId: updated.studentId,
      conversationId: updated.conversationId,
      type: "referral_status",
      text: body.data.status === "answered"
        ? "أجاب المعلم عن إحالتك العلمية."
        : body.data.status === "closed"
          ? "أغلق المعلم الإحالة العلمية."
          : "تم تحديث حالة الإحالة العلمية.",
    });
    res.json(UpdateMateenReferralStatusResponse.parse({
      id: updated.id,
      conversationId: updated.conversationId,
      studentName: student?.name ?? "",
      question: question?.question ?? "",
      context: updated.contextShared,
      reason: updated.reason,
      status: updated.status,
      createdAt: updated.createdAt,
    }));
  },
);

router.post(
  "/mateen/teacher/referrals/:referralId/messages",
  sameOrigin,
  authenticationRequired,
  async (req: AuthedRequest, res) => {
    if (!await requireApprovedTeacher(req.scholarlyUserId!, res)) return;
    const params = ReplyMateenReferralParams.safeParse(req.params);
    const body = ReplyMateenReferralBody.safeParse(req.body);
    if (!params.success || !body.success || !hasOnlyKeys(req.body, ["text", "requestId"])) {
      res.status(400).json({ error: "Invalid text-only teacher reply" });
      return;
    }
    if (!body.data.text.trim()) {
      res.status(400).json({ error: "Teacher reply cannot be blank" });
      return;
    }
    const message = await db.transaction(async (tx) => {
      const [referral] = await tx.select().from(scholarlyReferralsTable)
        .where(and(
          eq(scholarlyReferralsTable.id, params.data.referralId),
          eq(scholarlyReferralsTable.teacherId, req.scholarlyUserId!),
          ne(scholarlyReferralsTable.status, "closed"),
        )).for("update").limit(1);
      if (!referral) return null;
      const [created] = await tx.insert(scholarlyMessagesTable).values({
        id: body.data.requestId,
        conversationId: referral.conversationId,
        questionId: referral.questionId,
        senderId: req.scholarlyUserId!,
        role: "teacher",
        text: body.data.text.trim(),
      }).onConflictDoNothing().returning();
      if (!created) {
        if (!body.data.requestId) return null;
        const [previous] = await tx.select().from(scholarlyMessagesTable).where(and(
          eq(scholarlyMessagesTable.id, body.data.requestId),
          eq(scholarlyMessagesTable.senderId, req.scholarlyUserId!),
          eq(scholarlyMessagesTable.conversationId, referral.conversationId),
          eq(scholarlyMessagesTable.text, body.data.text.trim()),
        )).limit(1);
        return previous ?? null;
      }
      await tx.update(scholarlyReferralsTable)
        .set({ status: "answered", updatedAt: new Date() })
        .where(eq(scholarlyReferralsTable.id, referral.id));
      await tx.update(scholarlyConversationsTable)
        .set({ status: "answered", updatedAt: new Date() })
        .where(eq(scholarlyConversationsTable.id, referral.conversationId));
      await tx.insert(scholarlyNotificationsTable).values({
        userId: referral.studentId,
        conversationId: referral.conversationId,
        type: "teacher_reply",
        text: "أرسل المعلم ردًا نصيًا على إحالتك.",
      });
      return created;
    });
    if (!message) {
      res.status(404).json({ error: "Referral not found or closed" });
      return;
    }
    res.status(201).json(ReplyMateenReferralResponse.parse({
      id: message.id,
      role: message.role,
      text: message.text,
      createdAt: message.createdAt,
      citations: [],
    }));
  },
);

export default router;