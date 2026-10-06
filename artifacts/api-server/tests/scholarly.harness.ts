import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import {
  db, pool, profilesTable, teacherApplicationsTable, scholarlyConversationsTable,
  scholarlyQuestionsTable, scholarlyMessagesTable, scholarlySourcesTable,
  scholarlyPassagesTable, scholarlyEvaluationsTable,
} from "@workspace/db";
import router from "../src/routes/scholarly";
import { getScholarlyCorpus } from "../src/routes/scholarly.readiness";
import { SCHOLARLY_MODEL } from "../src/lib/scholarly";
import { setCompletion, setProviderConfigured } from "./doubles/provider";

export { db, pool };
export async function startHarness() {
  const cluster = process.env.SCHOLARLY_TEST_CLUSTER;
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(cluster?.startsWith("/tmp/mateen-participant-tests-"));
  assert.equal(url.searchParams.get("host"), `${cluster}/socket`);
  assert.equal(url.username, "mateen_test");
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message });
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    async request(user: string | null, method: string, path: string, body?: unknown, requestOrigin = origin) {
      const response = await fetch(`${origin}/api/mateen${path}`, {
        method, headers: {
          ...(user ? { "x-test-participant": user } : {}),
          origin: requestOrigin, "content-type": "application/json",
        }, body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      // Heterogeneous success/error HTTP payloads are asserted in each test;
      // the real routes still validate successful responses through API Zod.
      return { status: response.status, body: await response.json() as any };
    },
    async close() {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await pool.end();
    },
  };
}

export async function resetFixtures() {
  // Safe because the runner creates an isolated cluster and the harness checks
  // its socket before starting. No user-managed DATABASE_URL is accepted.
  const tables = await pool.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public'",
  );
  await pool.query(`TRUNCATE ${tables.rows.map(row => `"${row.tablename.replaceAll('"', '""')}"`).join(",")} CASCADE`);
  await db.insert(profilesTable).values([
    { clerkId: "student-a", name: "طالب أ", role: "student", onboarded: true },
    { clerkId: "student-b", name: "طالب ب", role: "student", onboarded: true },
    { clerkId: "teacher-a", name: "معلم أ", role: "teacher", onboarded: true },
    { clerkId: "teacher-b", name: "معلم ب", role: "teacher", onboarded: true },
  ]);
  await db.insert(teacherApplicationsTable).values([
    { userId: "teacher-a", status: "approved", available: true },
    { userId: "teacher-b", status: "approved", available: true },
  ]);
  setCompletion(async () => ({ abstain: true, reason: "امتناع اختباري", answer: null, citations: [] }));
  setProviderConfigured(true);
}

export async function question(
  owner = "student-a", status = "abstained", conversationId?: string, text = "سؤال خاص للاختبار",
) {
  if (!conversationId) {
    const [conversation] = await db.insert(scholarlyConversationsTable)
      .values({ studentId: owner, topic: text }).returning();
    conversationId = conversation.id;
  }
  const [row] = await db.insert(scholarlyQuestionsTable).values({
    conversationId, studentId: owner, question: text,
    textContext: "سياق السؤال المحال فقط", status,
    answer: status === "answered" ? "جواب خاص" : null,
    model: SCHOLARLY_MODEL, corpusHash: "fixture", reason: "امتناع اختباري",
  }).returning();
  await db.insert(scholarlyMessagesTable).values({
    conversationId, questionId: row.id, senderId: owner, role: "student", text,
  });
  return row;
}

export async function readyCorpus() {
  const [source] = await db.insert(scholarlySourcesTable).values({
    title: "مصدر اصطناعي للاختبار", author: "مؤلف اختباري", edition: "اختبار",
    textId: "nawawi",
    version: "fixture", legalAuthorization: "public_domain",
    authorizationReference: "synthetic fixture, not a real approval", status: "indexed",
    createdBy: "student-a",
  }).returning();
  const [passage] = await db.insert(scholarlyPassagesTable).values({
    sourceId: source.id, text: "النية في العمل نص اصطناعي للاختبار فقط", indexed: true, printedPage: "1",
  }).returning();
  const corpus = await getScholarlyCorpus();
  await db.insert(scholarlyEvaluationsTable).values({
    actorId: "student-a", model: SCHOLARLY_MODEL, corpusHash: corpus.hash,
    arabicQualityPassed: true, groundingPassed: true, abstentionPassed: true,
    serverRunPassed: true, evaluationNote: "synthetic fixture",
  });
  return { source, passage };
}

export function barrier() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

// Verify a request is really waiting on a PostgreSQL row lock rather than
// relying on sleeps or racing Promise.all and hoping for the desired order.
export async function waitForBlockedQuery(fragment: string) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const result = await pool.query(
      `select 1 from pg_stat_activity where datname = current_database()
       and pid <> pg_backend_pid() and wait_event_type = 'Lock' and query like $1`,
      [`%${fragment}%`],
    );
    if (result.rowCount) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(`No blocked database query containing ${fragment}`);
}

export async function changeTeacherWhileReferring(
  change: { status?: "pending_review"; available?: boolean },
  send: () => Promise<unknown>,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT user_id FROM mateen_teacher_applications WHERE user_id = 'teacher-a' FOR UPDATE");
    const pending = send();
    try {
      await waitForBlockedQuery("mateen_teacher_applications");
      if (change.status) await client.query("UPDATE mateen_teacher_applications SET status = $1 WHERE user_id = 'teacher-a'", [change.status]);
      if (change.available !== undefined) await client.query("UPDATE mateen_teacher_applications SET available = $1 WHERE user_id = 'teacher-a'", [change.available]);
      await client.query("COMMIT");
    } finally {
      await client.query("ROLLBACK");
    }
    return await pending;
  } finally { client.release(); }
}