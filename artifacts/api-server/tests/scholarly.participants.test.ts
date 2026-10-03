import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, beforeEach, test } from "node:test";
import { eq } from "drizzle-orm";
import {
  scholarlyConversationsTable, scholarlyMessagesTable, scholarlyNotificationsTable,
  scholarlyQuestionsTable, scholarlyReferralsTable, scholarlySourcesTable,
  teacherApplicationsTable, sourceVersionsTable,
} from "@workspace/db";
import {
  startHarness, resetFixtures, question, readyCorpus, barrier, db,
  changeTeacherWhileReferring, pool,
} from "./scholarly.harness";
import { setCompletion, ScholarlyProviderUnavailableError, getStudyCallCount } from "./doubles/provider";
import { setExcerptUnavailable, getExcerptCallCount } from "./doubles/excerpts";
import { hashSourcePayload } from "../src/lib/source-review";
import nawawi from "../src/data/nawawi.json";

let harness: Awaited<ReturnType<typeof startHarness>>;
before(async () => { harness = await startHarness(); });
after(async () => { await harness?.close(); });
beforeEach(resetFixtures);
const request = (...args: Parameters<typeof harness.request>) => harness.request(...args);
async function counts() {
  const result = await pool.query(
    `select (select count(*)::int from mateen_scholarly_questions) as questions,
      (select count(*)::int from mateen_scholarly_messages) as messages,
      (select count(*)::int from mateen_scholarly_referrals) as referrals,
      (select count(*)::int from mateen_scholarly_notifications) as notifications`,
  );
  return result.rows[0];
}
async function refer(q: Awaited<ReturnType<typeof question>>, teacherId = "teacher-a") {
  const response = await request("student-a", "POST", `/assistant/questions/${q.id}/referral`, {
    consent: true, teacherId,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const [referral] = await db.select().from(scholarlyReferralsTable)
    .where(eq(scholarlyReferralsTable.questionId, q.id));
  assert.ok(referral);
  return referral;
}

test("HTTP authentication and origin checks reject writes without database side effects", async () => {
  const q = await question();
  const initial = await counts();
  assert.equal((await request(null, "GET", "/assistant/questions")).status, 401);
  assert.equal((await request(null, "POST", "/assistant/questions", { question: "سؤال" })).status, 401);
  assert.equal((await request("student-a", "POST", `/assistant/questions/${q.id}/referral`,
    { consent: true }, "https://evil.example")).status, 403);
  assert.equal((await request("teacher-a", "POST", "/assistant/questions", { question: "سؤال" })).status, 403);
  assert.deepEqual(await counts(), initial);
});

test("assistant history, messages, status, follow-ups and issue reports enforce student ownership", async () => {
  const a = await question("student-a", "abstained", undefined, "سؤال أ سري");
  const b = await question("student-b", "answered", undefined, "سؤال ب سري");
  const historyA = await request("student-a", "GET", "/assistant/questions");
  const historyB = await request("student-b", "GET", "/assistant/questions");
  assert.equal(historyA.status, 200);
  assert.deepEqual(historyA.body.map((row: { questionId: string }) => row.questionId), [a.id]);
  assert.deepEqual(historyB.body.map((row: { questionId: string }) => row.questionId), [b.id]);
  const initial = await counts();
  for (const path of [
    `/conversations/${a.conversationId}/messages`,
    `/conversations/${a.conversationId}/status`,
    `/assistant/questions/${a.id}/referral-preview`,
  ]) assert.equal((await request("student-b", "GET", path)).status, 404);
  assert.equal((await request("student-b", "POST", `/conversations/${a.conversationId}/messages`,
    { text: "محاولة الدخول" })).status, 404);
  assert.equal((await request("student-b", "POST", "/assistant/issues",
    { questionId: a.id, category: "unsupported_claim", description: "بلاغ غير مخول" })).status, 404);
  assert.equal((await request("student-a", "GET", `/conversations/${a.conversationId}/messages`)).status, 200);
  assert.deepEqual(await counts(), initial);
});

test("only owned persisted abstained questions with explicit consent may be referred", async () => {
  const q = await question();
  const answered = await question("student-a", "answered");
  const initial = await counts();
  for (const body of [
    {}, { consent: false, teacherId: null }, { consent: "true", teacherId: null },
    { consent: true, teacherId: null, studentId: "student-b" },
    { consent: true, teacherId: null, contextShared: "سجل كامل" },
  ]) assert.equal((await request("student-a", "POST", `/assistant/questions/${q.id}/referral`, body)).status, 400);
  for (const [user, id] of [["student-b", q.id], ["student-a", answered.id], ["student-a", randomUUID()]]) {
    assert.equal((await request(user, "POST", `/assistant/questions/${id}/referral`, { consent: true, teacherId: null })).status, 404);
  }
  assert.equal((await request("student-a", "GET", `/assistant/questions/${answered.id}/referral-preview`)).status, 404);
  assert.deepEqual(await counts(), initial);
});

test("consent shares only the abstained question and context, never private history or other messages", async () => {
  const q = await question();
  const hidden = await question("student-a", "answered", q.conversationId, "سؤال سابق لا يجوز مشاركته");
  await db.insert(scholarlyMessagesTable).values([
    { conversationId: q.conversationId, questionId: hidden.id, role: "assistant", text: "جواب خاص لا يجوز مشاركته" },
    { conversationId: q.conversationId, questionId: null, role: "student", text: "رسالة دون صلة" },
  ]);
  await question("student-a", "abstained", undefined, "محادثة أخرى خاصة");
  const preview = await request("student-a", "GET", `/assistant/questions/${q.id}/referral-preview`);
  assert.equal(preview.status, 200);
  assert.deepEqual(preview.body.shares, [q.question, "المتن: الأربعون النووية\nسياق الطالب: سياق السؤال المحال فقط"]);
  assert.equal(JSON.stringify(preview.body).includes(hidden.question), false);
  const referral = await refer(q);
  assert.ok(referral.consentedAt instanceof Date);
  assert.equal(referral.contextShared, preview.body.textContext);
  const inbox = await request("teacher-a", "GET", "/teacher/referrals");
  assert.equal(inbox.status, 200);
  assert.deepEqual(inbox.body.map((row: { id: string }) => row.id), [referral.id]);
  assert.equal(JSON.stringify(inbox.body).includes(hidden.question), false);
  const visible = await request("teacher-a", "GET", `/conversations/${q.conversationId}/messages`);
  assert.equal(visible.status, 200);
  assert.deepEqual(visible.body.map((row: { text: string }) => row.text), [q.question]);
  assert.equal((await request("teacher-b", "GET", `/conversations/${q.conversationId}/messages`)).status, 404);
  assert.deepEqual((await request("teacher-b", "GET", "/conversations")).body, []);
  assert.deepEqual((await request("student-b", "GET", "/conversations")).body, []);
  assert.equal((await request("teacher-a", "GET", "/assistant/questions")).status, 403);
});

for (const change of [{ available: false }, { status: "pending_review" as const }]) {
  test(`concurrent selected-teacher ${Object.keys(change)[0]} change blocks referral and notification`, async () => {
    const q = await question();
    const preview = await request("student-a", "GET", `/assistant/questions/${q.id}/referral-preview`);
    assert.ok(preview.body.teachers.some((row: { id: string }) => row.id === "teacher-a"));
    const initial = await counts();
    const result = await changeTeacherWhileReferring(change, () =>
      request("student-a", "POST", `/assistant/questions/${q.id}/referral`, { consent: true, teacherId: "teacher-a" }));
    assert.equal((result as { status: number }).status, 409);
    assert.deepEqual(await counts(), initial);
  });
}

test("automatic selection rechecks concurrent availability and chooses an eligible teacher", async () => {
  const q = await question();
  const result = await changeTeacherWhileReferring({ available: false }, () =>
    request("student-a", "POST", `/assistant/questions/${q.id}/referral`, { consent: true, teacherId: null }));
  assert.equal((result as { status: number }).status, 201);
  const [referral] = await db.select().from(scholarlyReferralsTable);
  assert.equal(referral.teacherId, "teacher-b");
  const notifications = await db.select().from(scholarlyNotificationsTable);
  assert.deepEqual(notifications.map(row => row.userId), ["teacher-b"]);
});

test("no available teachers means a private waiting referral; retry assigns it once", async () => {
  const q = await question();
  await db.update(teacherApplicationsTable).set({ available: false });
  const waiting = await request("student-a", "POST", `/assistant/questions/${q.id}/referral`, { consent: true, teacherId: null });
  assert.equal(waiting.status, 201);
  assert.equal(waiting.body.status, "waiting_for_teacher");
  const [old] = await db.select().from(scholarlyReferralsTable);
  assert.equal(old.teacherId, null);
  assert.equal((await counts()).notifications, 0);
  assert.deepEqual((await request("teacher-a", "GET", "/teacher/referrals")).body, []);
  await db.update(teacherApplicationsTable).set({ available: true }).where(eq(teacherApplicationsTable.userId, "teacher-a"));
  const referral = await refer(q);
  assert.equal(referral.id, old.id);
  assert.equal((await counts()).referrals, 1);
  assert.equal((await counts()).notifications, 1);
  assert.equal((await request("student-a", "POST", `/assistant/questions/${q.id}/referral`,
    { consent: true, teacherId: "teacher-a" })).status, 409);
});

test("concurrent duplicate consents create exactly one referral and one teacher notification", async () => {
  const q = await question();
  const responses = await Promise.all([1, 2].map(() =>
    request("student-a", "POST", `/assistant/questions/${q.id}/referral`, { consent: true, teacherId: "teacher-a" })));
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  assert.equal((await counts()).referrals, 1);
  assert.equal((await counts()).notifications, 1);
});

test("unavailable but approved teachers can reply to established threads; retries cannot duplicate or alter messages", async () => {
  const q = await question();
  const referral = await refer(q);
  await db.update(teacherApplicationsTable).set({ available: false }).where(eq(teacherApplicationsTable.userId, "teacher-a"));
  assert.equal((await request("teacher-b", "POST", `/teacher/referrals/${referral.id}/messages`, { text: "ليس معلمي" })).status, 404);
  assert.equal((await request("teacher-b", "PATCH", `/teacher/referrals/${referral.id}/status`, { status: "closed" })).status, 404);
  const teacherBody = { text: "رد المعلم القائم", requestId: randomUUID() };
  for (let i = 0; i < 2; i++) {
    const reply = await request("teacher-a", "POST", `/teacher/referrals/${referral.id}/messages`, teacherBody);
    assert.equal(reply.status, 201);
    assert.equal(reply.body.id, teacherBody.requestId);
  }
  const studentBody = { text: "متابعة الطالب", requestId: randomUUID() };
  for (let i = 0; i < 2; i++)
    assert.equal((await request("student-a", "POST", `/conversations/${q.conversationId}/messages`, studentBody)).status, 201);
  const initial = await counts();
  assert.equal((await request("student-a", "POST", `/conversations/${q.conversationId}/messages`,
    { ...studentBody, text: "محتوى مختلف" })).status, 409);
  assert.equal((await request("teacher-a", "POST", `/teacher/referrals/${referral.id}/messages`,
    { ...teacherBody, text: "محتوى مختلف" })).status, 404);
  assert.deepEqual(await counts(), initial);
  assert.equal(initial.questions, 1);
  assert.equal(initial.messages, 3);
  assert.equal(initial.notifications, 3);
  const rows = await db.select().from(scholarlyMessagesTable);
  assert.ok(rows.every(row => row.conversationId === q.conversationId && row.questionId === q.id));
  assert.deepEqual((await request("teacher-a", "GET", `/conversations/${q.conversationId}/messages`)).body.map(
    (row: { text: string }) => row.text), [q.question, teacherBody.text, studentBody.text]);
  assert.equal((await request("teacher-a", "PATCH", `/teacher/referrals/${referral.id}/status`, { status: "closed" })).status, 200);
  const closedCounts = await counts();
  assert.equal((await request("teacher-a", "POST", `/teacher/referrals/${referral.id}/messages`, { text: "بعد الإغلاق" })).status, 404);
  assert.equal((await request("student-a", "POST", `/conversations/${q.conversationId}/messages`, { text: "بعد الإغلاق" })).status, 409);
  assert.deepEqual(await counts(), closedCounts);
});

test("revoked teachers lose inbox, thread, status and write access; student replies do not notify them", async () => {
  const q = await question();
  const referral = await refer(q);
  await db.update(teacherApplicationsTable).set({ status: "pending_review" }).where(eq(teacherApplicationsTable.userId, "teacher-a"));
  const initial = await counts();
  for (const path of ["/teacher/referrals", "/conversations"])
    assert.equal((await request("teacher-a", "GET", path)).status, 403);
  for (const path of [`/conversations/${q.conversationId}/messages`, `/conversations/${q.conversationId}/status`])
    assert.equal((await request("teacher-a", "GET", path)).status, 404);
  assert.equal((await request("teacher-a", "POST", `/teacher/referrals/${referral.id}/messages`, { text: "غير مخول" })).status, 403);
  assert.equal((await request("teacher-a", "PATCH", `/teacher/referrals/${referral.id}/status`, { status: "answered" })).status, 403);
  assert.equal((await request("student-a", "POST", `/conversations/${q.conversationId}/messages`, { text: "لا تشارك" })).status, 409);
  assert.deepEqual(await counts(), initial);
  assert.equal((await request("student-a", "GET", `/conversations/${q.conversationId}/messages`)).status, 200);
});

test("new assistant follow-ups stay private instead of sharing an unrelated question with an established teacher", async () => {
  const q = await question();
  await refer(q);
  const response = await request("student-a", "POST", "/assistant/questions", { question: "سؤال جديد مستقل" });
  assert.equal(response.status, 201);
  assert.notEqual(response.body.conversationId, q.conversationId);
  assert.equal((await request("teacher-a", "GET", `/conversations/${response.body.conversationId}/messages`)).status, 404);
  const followup = await request("student-a", "POST", `/conversations/${response.body.conversationId}/messages`, { text: "سؤال آخر مستقل" });
  assert.equal(followup.status, 201);
  assert.notEqual(followup.body.conversationId, response.body.conversationId);
  assert.equal((await request("teacher-a", "GET", `/conversations/${followup.body.conversationId}/messages`)).status, 404);
  assert.equal((await counts()).referrals, 1);
  assert.equal((await counts()).notifications, 1);
});

test("HTTP numbered commentary excerpts persist without claiming source approval or model generation", async () => {
  const readiness = await request("student-a", "GET", "/assistant/readiness");
  assert.equal(readiness.body.assistantEnabled, false);
  assert.equal(readiness.body.studyAnswersEnabled, true);
  const response = await request("student-a", "POST", "/assistant/questions", {
    question: "ما معنى الحديث الأول في الأربعين النووية؟",
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.status, "unverified");
  assert.match(response.body.answer, /مقتطف مرجعي قصير/);
  assert.equal(response.body.model, "reference-excerpt");
  assert.match(response.body.answer, /رابط المرجع: https:\/\/shamela\.ws\/book\/21812\/5/);
  assert.deepEqual(response.body.citations, []);
  const saved = (await db.select().from(scholarlyQuestionsTable))
    .find(row => row.id === response.body.questionId);
  assert.equal(saved?.answer, response.body.answer);
  assert.equal(saved?.status, "unverified");
  const history = await request("student-a", "GET", "/assistant/questions");
  assert.ok(history.body.some((row: { questionId: string; status: string }) =>
    row.questionId === response.body.questionId && row.status === "unverified"));
  const thread = await request("student-a", "GET", `/conversations/${response.body.conversationId}/messages`);
  assert.ok(thread.body.some((row: { role: string; text: string }) =>
    row.role === "assistant" && row.text === response.body.answer));
  assert.deepEqual(await db.select().from(scholarlySourcesTable), []);
});

test("HTTP unavailable excerpts privately save the question without a generated replacement", async () => {
  setExcerptUnavailable(true);
  try {
    const response = await request("student-a", "POST", "/assistant/questions", {
      question: "اشرح الحديث الأول",
    });
    assert.equal(response.status, 503);
    const [saved] = await db.select().from(scholarlyQuestionsTable)
      .where(eq(scholarlyQuestionsTable.id, response.body.questionId));
    assert.equal(saved?.answer, null);
    assert.equal(saved?.status, "abstained");
    assert.equal(saved?.model, "reference-excerpt");
    const messages = await db.select().from(scholarlyMessagesTable)
      .where(eq(scholarlyMessagesTable.questionId, saved.id));
    assert.deepEqual(messages.map(message => message.role), ["student"]);
    assert.deepEqual(await db.select().from(scholarlySourcesTable), []);
  } finally {
    setExcerptUnavailable(false);
  }
});

test("HTTP general study questions retain clearly labelled unverified educational answers", async () => {
  const response = await request("student-a", "POST", "/assistant/questions", {
    question: "كيف أنظم وقت الدراسة؟",
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.status, "unverified");
  assert.match(response.body.answer, /إجابة آلية غير موثّقة/);
  assert.deepEqual(response.body.citations, []);
});

async function restoreStudyFixtures() {
  // Each test truncates its private cluster; the process-level initial seed
  // cache does not reset. Restore only pending study fixtures needed here,
  // never approvals or production records.
  await db.insert(sourceVersionsTable).values(nawawi
    .filter(record => [1, 7, 16].includes(record.number))
    .map(record => {
      const payload = {
        hadithNumber: record.number, text: record.text, printedPage: record.sourcePage,
        viewerPage: Number(new URL(record.sourceUrl).searchParams.get("page")),
        viewerUrl: record.sourceUrl, edition: "بيانات دراسة للاختبار المعزول",
        changeReason: "تجهيز بيانات اختبار فقط", rightsEvidence: "", rightsUrl: "",
      };
      return {
        id: `test-study-${record.number}`, hadithNumber: record.number, version: 1,
        payload, payloadHash: hashSourcePayload(payload), createdBy: "system:test",
      };
    }));
}

test("HTTP recognizes number-before-hadith phrasing, quoted text, names and study context", async () => {
  await restoreStudyFixtures();
  for (const [question, textContext, number] of [
    ["اشرح لي 1 حديث في الاربيعن النووية", undefined, 1],
    ["اشرح لي ١ حديث", undefined, 1],
    ["اشرح إنما الأعمال بالنيات", undefined, 1],
    ["اشرح حديث النية", undefined, 1],
    ["ما معنى الدين النصيحة؟", undefined, 7],
    ["اشرح لا تغضب", undefined, 16],
    ["اشرح هذا النص", "إنما الأعمال بالنيات وإنما لكل امرئ ما نوى", 1],
  ] as const) {
    const response = await request("student-a", "POST", "/assistant/questions", {
      question, ...(textContext ? { textContext } : {}),
    });
    assert.equal(response.status, 201, question);
    assert.equal(response.body.status, "unverified", question);
    assert.equal(response.body.model, "reference-excerpt", question);
    assert.match(response.body.answer, new RegExp(`الحديث رقم ${number}\\.`), question);
  }
});

test("HTTP conflicting references and invalid bare numbers clarify without any excerpt or model generation", async () => {
  await restoreStudyFixtures();
  const excerptsBefore = getExcerptCallCount();
  const studyBefore = getStudyCallCount();
  setCompletion(async () => { assert.fail("Ambiguous/invalid references must not call model completion"); });
  for (const question of [
    "اشرح حديث النية وحديث النصيحة", "حديث النية وحديث النصيحة",
    "اشرح حديث النية والنصيحة", "اشرح الحديث 1 و2",
    "اشرح الحديث 1 وحديث النصيحة", "اشرح الحديث 1 الدين النصيحة",
    "اشرح 99", "اشرح ٠",
  ]) {
    const response = await request("student-a", "POST", "/assistant/questions", { question });
    assert.equal(response.status, 201, question);
    assert.equal(response.body.status, "abstained", question);
    assert.equal(response.body.answer, null, question);
    assert.equal(response.body.model, "reference-excerpt", question);
    assert.match(response.body.reason, /بعض ألفاظه أو عنوانه/, question);
    assert.deepEqual(response.body.citations, [], question);
    const messages = await db.select().from(scholarlyMessagesTable)
      .where(eq(scholarlyMessagesTable.questionId, response.body.questionId));
    assert.deepEqual(messages.map(message => message.role), ["student"], question);
  }
  assert.equal(getExcerptCallCount(), excerptsBefore);
  assert.equal(getStudyCallCount(), studyBefore);
});

test("HTTP asks for wording or a title only when the hadith cannot be identified safely", async () => {
  for (const question of ["اشرح الحديث في الأربعين النووية", "اشرح الحديث رقم 99"]) {
    const response = await request("student-a", "POST", "/assistant/questions", { question });
    assert.equal(response.status, 201);
    assert.equal(response.body.status, "abstained");
    assert.equal(response.body.answer, null);
    assert.match(response.body.reason, /بعض ألفاظه أو عنوانه/);
  }
});

test("HTTP completion publishes indexed-source citations when the source remains eligible", async () => {
  const { source, passage } = await readyCorpus();
  setCompletion(async () => ({
    abstain: false, reason: "", answer: passage.text,
    citations: [{ passageId: passage.id, quote: passage.text }],
  }));
  const response = await request("student-a", "POST", "/assistant/questions", { question: "ما النية في العمل؟" });
  assert.equal(response.status, 201);
  assert.equal(response.body.status, "answered");
  assert.equal(response.body.answer, passage.text);
  assert.equal(response.body.citations[0].sourceId, source.id);
  const messages = await db.select().from(scholarlyMessagesTable);
  assert.equal(messages.filter(row => row.role === "assistant").length, 1);
});

test("source withdrawal while model completion is pending persists abstention without answer or citations", async () => {
  const { source, passage } = await readyCorpus();
  const entered = barrier();
  const resume = barrier();
  setCompletion(async () => {
    entered.release();
    await resume.promise;
    return { abstain: false, reason: "", answer: passage.text, citations: [{ passageId: passage.id, quote: passage.text }] };
  });
  const pending = request("student-a", "POST", "/assistant/questions", { question: "ما النية في العمل؟" });
  try {
    await Promise.race([entered.promise, new Promise((_, reject) => setTimeout(() => reject(new Error("Model was not called")), 10000).unref())]);
    await db.update(scholarlySourcesTable).set({ status: "withdrawn" }).where(eq(scholarlySourcesTable.id, source.id));
  } finally { resume.release(); }
  const response = await pending;
  assert.equal(response.status, 201);
  assert.equal(response.body.status, "abstained");
  assert.equal(response.body.answer, null);
  assert.deepEqual(response.body.citations, []);
  const [saved] = await db.select().from(scholarlyQuestionsTable);
  assert.equal(saved.status, "abstained");
  assert.equal(saved.answer, null);
  const messages = await db.select().from(scholarlyMessagesTable);
  assert.deepEqual(messages.map(row => row.role), ["student"]);
  assert.deepEqual(messages[0].citations, []);
});

test("provider failure privately saves the question with no assistant message", async () => {
  await readyCorpus();
  setCompletion(async () => { throw new ScholarlyProviderUnavailableError(); });
  const response = await request("student-a", "POST", "/assistant/questions", { question: "ما النية في العمل؟" });
  assert.equal(response.status, 503);
  const [saved] = await db.select().from(scholarlyQuestionsTable);
  assert.equal(saved.id, response.body.questionId);
  assert.equal(saved.status, "abstained");
  assert.equal(saved.answer, null);
  assert.deepEqual(await counts(), { questions: 1, messages: 1, referrals: 0, notifications: 0 });
  assert.deepEqual((await request("student-b", "GET", "/assistant/questions")).body, []);
});