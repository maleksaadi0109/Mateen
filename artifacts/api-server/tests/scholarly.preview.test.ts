import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { before, after, beforeEach, afterEach, test } from "node:test";
import express from "express";
import {
  db, pool, profilesTable, scholarlyAuditTable, scholarlySourcesTable,
  scholarlyPassagesTable, scholarlyEvaluationsTable, scholarlyRuntimeConfigTable,
  scholarlyConversationsTable, scholarlyQuestionsTable, scholarlyMessagesTable,
} from "@workspace/db";
import adminRouter from "../src/routes/scholarly.admin";
import { NVIDIA_SCHOLARLY_MODEL } from "../src/lib/scholarly";
import { identities, type TestIdentity } from "./doubles/preview-auth";

// Real HTTP router, security policy, provider parsing and disposable PostgreSQL.
// Neither these identities nor responses constitute scientific model evaluation.
const prompt = "سؤال اصطناعي سري لا يجوز حفظه";
const answer = "مسودة اصطناعية سرية لا يجوز حفظها";
const nativeFetch = globalThis.fetch;
let transport: () => Promise<Response>;
let calls: Array<Record<string, any>> = [];
let server: ReturnType<express.Express["listen"]>;
let origin: string;
let initial: unknown;
let auditInitial: unknown;

function envelope() {
  return Response.json({ choices: [{ message: { content: JSON.stringify({ answer }) } }] });
}
function actor(identity: TestIdentity = { content: true }) {
  const id = `preview-test-${randomUUID()}`;
  identities.set(id, identity);
  return id;
}
async function request(id: string | null, body: unknown = { question: prompt }, requestOrigin = origin) {
  const response = await nativeFetch(`${origin}/api/mateen/admin/scholarly/preview`, {
    method: "POST",
    headers: {
      "content-type": "application/json", origin: requestOrigin,
      ...(id ? { "x-test-preview-user": id } : {}),
    },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, headers: response.headers, body: await response.json() as any };
}
async function snapshot() {
  const tables = await pool.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname='public' and tablename like 'mateen_scholarly_%' and tablename <> 'mateen_scholarly_audit' order by tablename",
  );
  const result: Record<string, unknown> = {};
  for (const { tablename } of tables.rows) {
    const rows = await pool.query(`SELECT * FROM "${tablename.replaceAll('"', '""')}" ORDER BY id`);
    result[tablename] = rows.rows;
  }
  return result;
}
function barrier() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

before(async () => {
  const cluster = process.env.SCHOLARLY_TEST_CLUSTER;
  assert.ok(cluster?.startsWith("/tmp/mateen-participant-tests-"));
  const url = new URL(process.env.DATABASE_URL!);
  assert.equal(url.searchParams.get("host"), `${cluster}/socket`);
  assert.equal(url.username, "mateen_test");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { log: { warn() {} } });
    next();
  });
  app.use("/api", adminRouter);
  app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.status ?? 500).json({ error: err.name });
  });
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
  // Seed nonempty protected rows: equality checks detect updates/deletes as well as inserts.
  await db.insert(profilesTable).values({ clerkId: "fixture-student", name: "اختبار", role: "student" });
  const [source] = await db.insert(scholarlySourcesTable).values({
    title: "مصدر اصطناعي", author: "اختبار", edition: "اختبار", version: "fixture",
    legalAuthorization: "public_domain", authorizationReference: "synthetic only",
    createdBy: "fixture-student",
  }).returning();
  await db.insert(scholarlyPassagesTable).values({ sourceId: source.id, text: "نص اصطناعي" });
  await db.insert(scholarlyEvaluationsTable).values({
    actorId: "fixture-student", model: NVIDIA_SCHOLARLY_MODEL, corpusHash: "synthetic",
    arabicQualityPassed: false, groundingPassed: false, abstentionPassed: false,
    serverRunPassed: false, evaluationNote: "Not scientific evaluation",
  });
  await db.insert(scholarlyRuntimeConfigTable).values({ id: 1, model: "gpt-5.4-mini" });
  const [conversation] = await db.insert(scholarlyConversationsTable)
    .values({ studentId: "fixture-student", topic: "اختبار" }).returning();
  const [question] = await db.insert(scholarlyQuestionsTable).values({
    conversationId: conversation.id, studentId: "fixture-student", question: "سؤال طالب اصطناعي",
    status: "abstained", model: "gpt-5.4-mini", corpusHash: "synthetic",
  }).returning();
  await db.insert(scholarlyMessagesTable).values({
    conversationId: conversation.id, questionId: question.id, senderId: "fixture-student",
    role: "student", text: "رسالة طالب اصطناعية",
  });
  globalThis.fetch = async (input, init) => {
    // No network fallback: an unexpected provider URL fails this test.
    assert.equal(String(input), "https://integrate.api.nvidia.com/v1/chat/completions");
    assert.equal(init?.method, "POST");
    calls.push(JSON.parse(String(init?.body)));
    return transport();
  };
});
beforeEach(async () => {
  calls = [];
  transport = async () => envelope();
  initial = await snapshot();
  auditInitial = await db.select().from(scholarlyAuditTable);
});
afterEach(async () => {
  assert.deepEqual(await snapshot(), initial, "Preview must not mutate source, evaluation, config or student data");
});
after(async () => {
  globalThis.fetch = nativeFetch;
  if (server) await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  await pool.end();
});

test("secure content reviewer receives an unreviewed no-store draft; audit has no content", async () => {
  const id = actor();
  const response = await request(id, { question: `  ${prompt}  ` });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(Object.keys(response.body).sort(), ["answer", "generatedAt", "model", "reviewStatus", "sourceGrounded"]);
  assert.equal(response.body.answer, answer);
  assert.equal(response.body.model, NVIDIA_SCHOLARLY_MODEL);
  assert.equal(response.body.reviewStatus, "unreviewed");
  assert.equal(response.body.sourceGrounded, false);
  assert.ok(Number.isFinite(Date.parse(response.body.generatedAt)));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, NVIDIA_SCHOLARLY_MODEL);
  assert.equal(calls[0].messages[1].content, prompt);
  const audit = await db.select().from(scholarlyAuditTable);
  assert.equal(audit.length, (auditInitial as unknown[]).length + 1);
  const row = audit.find(entry => entry.actorId === id)!;
  assert.equal(row.action, "private_preview_generated");
  assert.equal(row.targetType, "assistant_preview");
  assert.equal(row.targetId, null);
  assert.deepEqual(row.details, { model: NVIDIA_SCHOLARLY_MODEL, sourceGrounded: false });
  assert.match(row.reason, /not a scientific evaluation or student answer/);
  assert.ok(!JSON.stringify(audit).includes(prompt));
  assert.ok(!JSON.stringify(audit).includes(answer));
});

test("unauthenticated, cross-origin, student and qualification-only requests cannot reach provider", async () => {
  assert.equal((await request(null)).status, 401);
  assert.equal((await request(actor(), undefined, "https://foreign.invalid")).status, 403);
  const student = actor({});
  await db.insert(profilesTable).values({
    clerkId: student, name: "طالب اصطناعي", role: "student", onboarded: true,
  });
  assert.equal((await request(student)).status, 403);
  assert.equal((await request(actor({ qualification: true }))).status, 403);
  assert.equal(calls.length, 0);
  assert.deepEqual(await db.select().from(scholarlyAuditTable), auditInitial);
});

test("MFA, verified second factor, verified email and active account are all required", async () => {
  for (const identity of [
    { content: true, mfa: false }, { content: true, factorAge: [0, null] as [number, null] },
    { content: true, verified: false }, { content: true, banned: true }, { content: true, locked: true },
  ]) assert.equal((await request(actor(identity))).status, 403);
  assert.equal(calls.length, 0);
  assert.deepEqual(await db.select().from(scholarlyAuditTable), auditInitial);
});

test("revoked permission during provider generation suppresses the draft and audit", async () => {
  const id = actor();
  const entered = barrier(), finish = barrier();
  transport = async () => { entered.release(); await finish.promise; return envelope(); };
  const pending = request(id);
  try {
    await entered.promise;
    identities.set(id, { qualification: true });
  } finally { finish.release(); }
  const response = await pending;
  assert.equal(response.status, 403);
  assert.ok(!JSON.stringify(response.body).includes(answer));
  assert.equal(calls.length, 1);
  assert.deepEqual(await db.select().from(scholarlyAuditTable), auditInitial);
});

test("invalid bodies and extra fields rejected without generation", async () => {
  for (const body of [null, [], {}, { question: 123 }, { question: "  " }, { question: "ab" },
    { question: "x".repeat(2001) }, { question: prompt, answer }, { question: " a " }]) {
    assert.equal((await request(actor(), body)).status, 400, JSON.stringify(body));
  }
  assert.equal(calls.length, 0);
  assert.deepEqual(await db.select().from(scholarlyAuditTable), auditInitial);
});

test("five requests allowed per actor; sixth blocked while another reviewer remains independent", async () => {
  const id = actor();
  for (let i = 0; i < 5; i++) assert.equal((await request(id)).status, 200);
  const auditBeforeLimit = await db.select().from(scholarlyAuditTable);
  const response = await request(id);
  assert.equal(response.status, 429);
  assert.equal(calls.length, 5);
  assert.deepEqual(await db.select().from(scholarlyAuditTable), auditBeforeLimit);
  assert.equal((await request(actor())).status, 200);
  assert.equal(calls.length, 6);
});

test("provider HTTP, network and malformed-response failures return 503 without content or audit", async () => {
  for (const failure of [
    async () => new Response("private provider diagnostic", { status: 500 }),
    async () => { throw new Error("private transport diagnostic"); },
    async () => Response.json({ choices: [{ message: { content: "not JSON" } }] }),
    async () => Response.json({ choices: [{ message: { content: JSON.stringify({ answer: "" }) } }] }),
  ]) {
    transport = failure;
    const response = await request(actor());
    assert.equal(response.status, 503);
    assert.ok(!JSON.stringify(response.body).includes("diagnostic"));
    assert.ok(!JSON.stringify(response.body).includes(answer));
  }
  assert.deepEqual(await db.select().from(scholarlyAuditTable), auditInitial);
});