import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import express from "express";
import { db, pool, scholarlyPassagesTable, scholarlySourcesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import router from "../src/routes/scholarly.admin";
import { getAljam3Package } from "../src/lib/scholarly-aljam3-package";
import { identities, type TestIdentity } from "./doubles/preview-auth";
import { getPrivateScholarlyPackage } from "../src/lib/private-scholarly-data";
const { prepared } = getPrivateScholarlyPackage();
import { digest, findCollationPassage } from "../src/lib/scholarly-collation";

// Reproduce the previous schema, not fictitious v2 scientific approvals.
function legacyPackage() {
  const source = Object.fromEntries(Object.entries(prepared.source).filter(([key]) =>
    !["publicationStatus", "collationStatus", "collationEvidence", "collationLimitations", "collationSummary"].includes(key)));
  source.pageHtmlSha256 = "edb6b93e23942fc167ff22368d97cb09e2069ee3acb71e797b5861ae4aba0a5c";
  return { format: "mateen-source-preparation-v1", source, passages: prepared.passages.map(p => ({
    id: p.id, text: p.text, sourceUrl: p.sourceUrl, viewerPage: p.viewerPage,
    printedPage: null, pdfPage: null, volume: p.volume, startOffset: p.startOffset,
    endOffset: p.endOffset, textSha256: p.textSha256, reviewStatus: p.reviewStatus, indexed: false,
  })) };
}

// Only the disposable runner can run this suite. Real accounts and authority
// are never created or changed, and existing approval journeys are not exercised.
let server: ReturnType<express.Express["listen"]>;
let origin: string;
const path = "/api/mateen/admin/scholarly/imports/aljam3";
function actor(identity: TestIdentity = { content: true }) {
  const id = `import-test-${randomUUID()}`;
  identities.set(id, identity);
  return id;
}
async function request(id: string | null, body: unknown = { confirmUnreviewed: true },
  method = "POST", url = path, requestOrigin = origin) {
  const response = await fetch(`${origin}${url}`, {
    method, headers: { "content-type": "application/json", origin: requestOrigin,
      ...(id ? { "x-test-preview-user": id } : {}) },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, body: await response.json() as any };
}
async function totals() {
  const { rows } = await pool.query(`select
    (select count(*)::int from mateen_scholarly_sources) sources,
    (select count(*)::int from mateen_scholarly_passages) passages,
    (select count(*)::int from mateen_scholarly_audit) audit`);
  return rows[0];
}
before(async () => {
  const cluster = process.env.SCHOLARLY_TEST_CLUSTER;
  assert.ok(cluster?.startsWith("/tmp/mateen-participant-tests-"));
  assert.equal(new URL(process.env.DATABASE_URL!).searchParams.get("host"), `${cluster}/socket`);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { Object.assign(req, { log: { warn() {} } }); next(); });
  app.use("/api", router);
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", error => error ? reject(error) : resolve());
  });
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
beforeEach(async () => {
  await pool.query("TRUNCATE mateen_scholarly_sources, mateen_scholarly_audit CASCADE");
});
after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await pool.end();
});

test("package/auth boundary: anonymous, ordinary, unverified and insecure identities cannot import", async () => {
  assert.equal((await request(null)).status, 401);
  for (const identity of [{}, { content: true, verified: false }, { content: true, mfa: false },
    { content: true, factorAge: [0, null] as [number, null] }]) {
    const id = actor(identity);
    assert.equal((await request(id)).status, 403);
    assert.equal((await request(id, undefined, "GET")).status, 403);
  }
  assert.equal((await request(actor(), undefined, "POST", path, "https://other.invalid")).status, 403);
  const id = actor();
  for (const body of [{ confirmUnreviewed: false }, {}, { confirmUnreviewed: true, createdBy: "forged" }]) {
    assert.equal((await request(id, body)).status, 400);
  }
  assert.deepEqual(await totals(), { sources: 0, passages: 0, audit: 0 });
});

test("imports exact 461 passages, provenance and attestation as an unindexed draft owned by the actor", async () => {
  const p = getAljam3Package();
  const id = actor();
  const manifest = await request(id, undefined, "GET");
  assert.equal(manifest.status, 200);
  assert.equal(manifest.body.passageCount, 461);
  assert.equal(manifest.body.authorizationStatement, p.source.authorizationStatement);
  const result = await request(id);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { sourceId: result.body.sourceId, outcome: "imported",
    totalCount: 461, importedCount: 461, existingCount: 0 });
  const [source] = await db.select().from(scholarlySourcesTable);
  assert.equal(source.createdBy, id);
  assert.equal(source.status, "draft");
  assert.equal(source.reviewedBy, null);
  assert.equal(source.reviewedAt, null);
  assert.equal(source.indexedAt, null);
  assert.equal(source.authorizationReference, p.source.authorizationStatement);
  assert.deepEqual(source.preparationMetadata, {
    ...p.source, packageFormat: p.format, packageSha256: p.packageSha256, quoteCandidates: p.quoteCandidates,
  });
  const passages = await db.select().from(scholarlyPassagesTable);
  assert.equal(passages.length, 461);
  const originals = new Map(p.passages.map(passage => [passage.id, passage]));
  for (const passage of passages) {
    const original = originals.get(passage.preparationMetadata!.id as string)!;
    assert.ok(original);
    assert.equal(passage.text, original.text);
    assert.equal(passage.sourceUrl, original.sourceUrl);
    assert.equal(passage.viewerPage, original.viewerPage);
    assert.equal(passage.printedPage, original.printedPage);
    assert.equal(passage.pdfPage, original.pdfPage);
    assert.equal(passage.indexed, false);
    const { text: _text, ...provenance } = original;
    assert.deepEqual(passage.preparationMetadata, provenance);
    assert.equal(digest(passage.text), original.textSha256);
    assert.equal(passage.preparationMetadata!.studentEligible, false);
    assert.equal(findCollationPassage(passage.text, passage.sourceUrl, passage.viewerPage)!.originalText, passage.text);
  }
  const inspection = await request(id, undefined, "GET",
    `/api/mateen/admin/scholarly/sources/${source.id}/passages`);
  assert.equal(inspection.status, 200);
  assert.equal(inspection.body.length, 461);
  assert.ok(inspection.body.every((item: any) => item.sourceUrl && item.viewerPage));
  const comparison = await request(id, undefined, "GET",
    `/api/mateen/admin/scholarly/sources/${source.id}/collation`);
  assert.equal(comparison.status, 200);
  assert.equal(comparison.body.length, 461);
  const byId = new Map(passages.map(passage => [passage.id, passage]));
  for (const item of comparison.body) {
    const stored = byId.get(item.passageId)!;
    assert.equal(item.originalText, stored.text);
    assert.equal(item.correctedDraft, stored.preparationMetadata!.correctedDraft);
    assert.equal(item.exclusionReason, stored.preparationMetadata!.exclusionReason);
    assert.equal(item.pdfPage, stored.pdfPage);
    assert.equal(item.printedPage, stored.printedPage);
    for (const excerpt of item.excerpts) {
      assert.equal(item.originalText.slice(excerpt.originalStart, excerpt.originalEnd), excerpt.originalText);
    }
  }
  assert.equal((await request(null, undefined, "GET",
    `/api/mateen/admin/scholarly/sources/${source.id}/collation`)).status, 401);
  const audit = await pool.query("select actor_id, details from mateen_scholarly_audit");
  assert.equal(audit.rows[0].actor_id, id);
  assert.equal(audit.rows[0].details.passageCount, 461);
});

test("v1 and v2 share immutable identity; malformed originals, corrections and eligibility are rejected", () => {
  const v1 = getAljam3Package(legacyPackage());
  const v2 = getAljam3Package();
  assert.equal(v1.importKey, v2.importKey);
  assert.notEqual(v1.packageSha256, v2.packageSha256);
  for (const mutate of [
    (p: typeof prepared) => { p.format = "unknown"; },
    (p: typeof prepared) => { p.source.scientificApproval = "forged" as any; },
    (p: typeof prepared) => { p.passages[0].text += "changed"; },
    (p: typeof prepared) => { p.passages[1].id = p.passages[0].id; },
    (p: typeof prepared) => { p.passages[0].studentEligible = true; },
    (p: typeof prepared) => { p.passages[0].indexed = true; },
    (p: typeof prepared) => { p.passages[0].corrections[0].originalStart++; },
    (p: typeof prepared) => { p.passages[0].corrections[0].after += "changed"; },
    (p: typeof prepared) => { p.passages[0].correctedDraft += "changed"; },
    (p: typeof prepared) => {
      p.passages[0].correctedDraft += "changed";
      p.passages[0].correctedDraftSha256 = digest(p.passages[0].correctedDraft!);
    },
    (p: typeof prepared) => { p.passages[0].corrections = []; p.passages[0].correctedDraft = null; },
    (p: typeof prepared) => { p.quoteCandidates = []; },
    (p: typeof prepared) => { p.quoteCandidates[0].studentEligible = true; },
    (p: typeof prepared) => { p.quoteCandidates[0].indexed = true; },
    (p: typeof prepared) => { p.quoteCandidates[0].originalEnd++; },
    (p: typeof prepared) => { p.quoteCandidates[0].changes[0].originalStart++; },
    (p: typeof prepared) => { p.passages[0].corrections[0].evidence.imageSha256 = "0".repeat(64); },
    (p: typeof prepared) => { p.quoteCandidates[0].evidence.pdfSha256 = "0".repeat(64); },
    (p: typeof prepared) => { p.passages[5].pdfPage = 9; },
  ]) {
    const changed = structuredClone(prepared);
    mutate(changed);
    assert.throws(() => getAljam3Package(changed));
  }
});

async function seedLegacy(status: "draft" | "withdrawn" | "reviewed" | "indexed" = "draft") {
  const id = actor();
  await request(id, undefined, "GET");
  const p = legacyPackage();
  const importKey = `aljam3:${createHash("sha256").update(JSON.stringify(p)).digest("hex")}`;
  const [source] = await db.insert(scholarlySourcesTable).values({
    title: prepared.source.title, author: prepared.source.author, edition: prepared.source.edition,
    textId: prepared.source.textId, version: prepared.source.version, preparationMetadata: p.source,
    createdBy: id, legalAuthorization: "permission_granted",
    authorizationReference: prepared.source.authorizationStatement, importKey, status,
  }).returning();
  const rows = await db.insert(scholarlyPassagesTable).values(p.passages.map(({ text, ...provenance }) => ({
    sourceId: source.id, text, sourceUrl: provenance.sourceUrl,
    viewerPage: provenance.viewerPage, preparationMetadata: provenance,
  }))).returning();
  return { source, rows };
}

test("a complete v1 draft gains only bounded metadata in place; concurrent retries preserve source, passage IDs and original bytes", async () => {
  const { source, rows } = await seedLegacy();
  const replies = await Promise.all([request(actor()), request(actor())]);
  assert.ok(replies.every(r => r.status === 200 && r.body.sourceId === source.id &&
    r.body.outcome === "already_imported" && r.body.importedCount === 0));
  assert.deepEqual(await totals(), { sources: 1, passages: 461, audit: 1 });
  const [updated] = await db.select().from(scholarlySourcesTable);
  assert.equal(updated.importKey, source.importKey);
  assert.equal(updated.createdBy, source.createdBy);
  assert.equal(updated.status, "draft");
  assert.equal(updated.reviewedAt, null);
  assert.equal(updated.indexedAt, null);
  assert.deepEqual(updated.preparationMetadata!.quoteCandidates, prepared.quoteCandidates);
  const passages = await db.select().from(scholarlyPassagesTable);
  for (const row of rows) {
    const updated = passages.find(p => p.id === row.id)!;
    assert.equal(updated.text, row.text);
    assert.equal(updated.indexed, false);
    assert.equal(updated.preparationMetadata!.studentEligible, false);
    const original = prepared.passages.find(p => p.id === row.preparationMetadata!.id)!;
    const { text: _text, ...provenance } = original;
    assert.deepEqual(updated.preparationMetadata, provenance);
  }
});

test("withdrawn legacy imports are not restored or enriched", async () => {
  const { source, rows } = await seedLegacy("withdrawn");
  const result = await request(actor());
  assert.equal(result.status, 200);
  assert.equal(result.body.sourceId, source.id);
  assert.deepEqual((await db.select().from(scholarlySourcesTable))[0], source);
  const unchanged = new Map((await db.select().from(scholarlyPassagesTable)).map(row => [row.id, row]));
  assert.equal(unchanged.size, rows.length);
  for (const row of rows) assert.deepEqual(unchanged.get(row.id), row);
  assert.deepEqual(await totals(), { sources: 1, passages: 461, audit: 0 });
});

test("reviewed/indexed legacy sources and their authority fields are never rewritten", async () => {
  for (const status of ["reviewed", "indexed"] as const) {
    await pool.query("TRUNCATE mateen_scholarly_sources, mateen_scholarly_audit CASCADE");
    const { source } = await seedLegacy(status);
    await db.update(scholarlySourcesTable).set({ reviewedBy: source.createdBy, reviewedAt: new Date(),
      ...(status === "indexed" ? { indexedAt: new Date() } : {}),
    }).where(eq(scholarlySourcesTable.id, source.id));
    if (status === "indexed") await db.update(scholarlyPassagesTable).set({ indexed: true });
    const beforeSource = await db.select().from(scholarlySourcesTable);
    const beforeRows = new Map((await db.select().from(scholarlyPassagesTable)).map(row => [row.id, row]));
    assert.equal((await request(actor())).body.outcome, "already_imported");
    assert.deepEqual(await db.select().from(scholarlySourcesTable), beforeSource);
    for (const row of await db.select().from(scholarlyPassagesTable)) assert.deepEqual(row, beforeRows.get(row.id));
    assert.deepEqual(await totals(), { sources: 1, passages: 461, audit: 0 });
  }
});

test("renamed legacy sources still block duplicate import by raw-byte identity", async () => {
  const { source } = await seedLegacy();
  await db.update(scholarlySourcesTable).set({ title: "Renamed legacy source" })
    .where(eq(scholarlySourcesTable.id, source.id));
  assert.equal((await request(actor())).status, 409);
  assert.deepEqual(await totals(), { sources: 1, passages: 461, audit: 0 });
});

test("failed legacy enrichment or audit rolls back all metadata while retaining original rows for retry", async () => {
  for (const table of ["mateen_scholarly_passages", "mateen_scholarly_audit"]) {
    await pool.query("TRUNCATE mateen_scholarly_sources, mateen_scholarly_audit CASCADE");
    const { source, rows } = await seedLegacy();
    const event = table.endsWith("passages") ? "UPDATE" : "INSERT";
    await pool.query(`CREATE FUNCTION import_test_update_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected metadata failure'; END $$;
      CREATE TRIGGER import_test_update_fail BEFORE ${event} ON ${table}
      FOR EACH ROW EXECUTE FUNCTION import_test_update_fail();`);
    try {
      assert.equal((await request(actor())).status, 503);
      assert.deepEqual((await db.select().from(scholarlySourcesTable))[0], source);
      const unchanged = new Map((await db.select().from(scholarlyPassagesTable)).map(row => [row.id, row]));
      for (const row of rows) assert.deepEqual(unchanged.get(row.id), row);
      assert.deepEqual(await totals(), { sources: 1, passages: 461, audit: 0 });
    } finally {
      await pool.query(`DROP TRIGGER import_test_update_fail ON ${table}; DROP FUNCTION import_test_update_fail();`);
    }
    assert.equal((await request(actor())).body.sourceId, source.id);
    assert.deepEqual(await totals(), { sources: 1, passages: 461, audit: 1 });
  }
});

test("equal-count changed/duplicated originals and incomplete imports conflict without writes", async () => {
  for (const corrupt of ["changed", "duplicate", "missing", "extra"]) {
    await pool.query("TRUNCATE mateen_scholarly_sources, mateen_scholarly_audit CASCADE");
    const { rows } = await seedLegacy();
    if (corrupt === "missing") await db.delete(scholarlyPassagesTable).where(eq(scholarlyPassagesTable.id, rows[0].id));
    if (corrupt === "extra") {
      const { id: _id, createdAt: _createdAt, ...copy } = rows[0];
      await db.insert(scholarlyPassagesTable).values(copy);
    }
    if (corrupt === "changed") await db.update(scholarlyPassagesTable)
      .set({ text: rows[0].text + "changed" }).where(eq(scholarlyPassagesTable.id, rows[0].id));
    if (corrupt === "duplicate") await db.update(scholarlyPassagesTable)
      .set({ preparationMetadata: rows[0].preparationMetadata }).where(eq(scholarlyPassagesTable.id, rows[1].id));
    const before = await totals();
    assert.equal((await request(actor())).status, 409);
    assert.deepEqual(await totals(), before);
  }
});

test("a retry cannot silently confirm corrupted v2 correction or candidate provenance", async () => {
  for (const corruption of ["correction", "candidate"]) {
    await pool.query("TRUNCATE mateen_scholarly_sources, mateen_scholarly_audit CASCADE");
    assert.equal((await request(actor())).status, 200);
    const [source] = await db.select().from(scholarlySourcesTable);
    if (corruption === "candidate") {
      await db.update(scholarlySourcesTable).set({
        preparationMetadata: { ...source.preparationMetadata, quoteCandidates: [] },
      }).where(eq(scholarlySourcesTable.id, source.id));
    } else {
      const [row] = await db.select().from(scholarlyPassagesTable);
      await db.update(scholarlyPassagesTable).set({
        preparationMetadata: { ...row.preparationMetadata, corrections: [] },
      }).where(eq(scholarlyPassagesTable.id, row.id));
    }
    assert.equal((await request(actor())).status, 409);
    assert.deepEqual(await totals(), { sources: 1, passages: 461, audit: 1 });
  }
});

test("concurrent submissions and a retry after a lost response return the same source without altering it", async () => {
  const replies = await Promise.all([request(actor()), request(actor()), request(actor())]);
  assert.ok(replies.every(r => r.status === 200));
  assert.equal(new Set(replies.map(r => r.body.sourceId)).size, 1);
  assert.equal(replies.filter(r => r.body.outcome === "imported").length, 1);
  assert.deepEqual(await totals(), { sources: 1, passages: 461, audit: 1 });
  const sourceId = replies[0].body.sourceId;
  const [before] = await db.select().from(scholarlySourcesTable);
  await db.update(scholarlySourcesTable).set({ status: "withdrawn" }).where(eq(scholarlySourcesTable.id, sourceId));
  const retry = await request(actor());
  assert.equal(retry.body.outcome, "already_imported");
  assert.equal(retry.body.importedCount, 0);
  assert.equal(retry.body.existingCount, 461);
  const [after] = await db.select().from(scholarlySourcesTable);
  assert.equal(after.status, "withdrawn");
  assert.equal(after.createdBy, before.createdBy);
  assert.deepEqual(await totals(), { sources: 1, passages: 461, audit: 1 });
});

test("passage and audit failures roll back the entire import and allow a clean retry", async () => {
  for (const table of ["mateen_scholarly_passages", "mateen_scholarly_audit"]) {
    await pool.query("TRUNCATE mateen_scholarly_sources, mateen_scholarly_audit CASCADE");
    await pool.query(`CREATE FUNCTION import_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN ${table.endsWith("passages") ? "IF NEW.viewer_page >= 100 THEN" : ""}
      RAISE EXCEPTION 'injected persistence failure';
      ${table.endsWith("passages") ? "END IF; RETURN NEW;" : ""} END $$;
      CREATE TRIGGER import_test_fail BEFORE INSERT ON ${table}
      FOR EACH ROW EXECUTE FUNCTION import_test_fail();`);
    try {
      assert.equal((await request(actor())).status, 503);
      assert.deepEqual(await totals(), { sources: 0, passages: 0, audit: 0 });
    } finally {
      await pool.query(`DROP TRIGGER import_test_fail ON ${table}; DROP FUNCTION import_test_fail();`);
    }
    assert.equal((await request(actor())).body.importedCount, 461);
  }
});

test("an existing manual edition/version is reported as a conflict, not modified or duplicated", async () => {
  const id = actor();
  await request(id, undefined, "GET"); // existing authorization creates the real-profile fixture
  const p = getAljam3Package();
  await db.insert(scholarlySourcesTable).values({
    title: p.source.title, author: p.source.author, edition: p.source.edition, version: p.source.version,
    createdBy: id, legalAuthorization: "permission_granted", authorizationReference: "test fixture",
  });
  assert.equal((await request(id)).status, 409);
  assert.deepEqual(await totals(), { sources: 1, passages: 0, audit: 0 });
});
