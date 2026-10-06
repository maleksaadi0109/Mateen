import { createHash } from "node:crypto";
import { getPrivateScholarlyPackage } from "./private-scholarly-data";
import type { Prepared } from "./private-scholarly-types";
import { z } from "zod";
import { findCollationPassage } from "./scholarly-collation";

const originalPassage = z.object({
  id: z.string().min(1), text: z.string().min(1).max(12000),
  sourceUrl: z.string(), viewerPage: z.number().int().min(5).max(405),
  printedPage: z.string().nullable(), pdfPage: z.number().int().positive().nullable(),
  volume: z.number().int().nullable(), startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(), textSha256: z.string().regex(/^[a-f0-9]{64}$/),
  reviewStatus: z.literal("unreviewed"), indexed: z.literal(false),
}).passthrough();
const packageShape = z.object({
  format: z.enum(["mateen-source-preparation-v1", "mateen-source-preparation-v2"]),
  source: z.object({
    title: z.string().min(1), author: z.string().min(1), edition: z.string().min(1),
    version: z.string().min(1), sourceUrl: z.string(), textId: z.string(),
    rawTextSha256: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.literal("prepared_unreviewed"),
    authorizationStatementKind: z.literal("user_attestation_not_independent_verification"),
    authorizationStatement: z.string().min(1), scientificApproval: z.null(),
  }).passthrough(),
  passages: z.array(originalPassage).length(461),
}).passthrough();

// Authorised packages are restored locally or copied into the private server build.
// Preparation is not scientific approval or independent permission verification.
export function getAljam3Package(input: unknown = getPrivateScholarlyPackage().prepared) {
  const { collation } = getPrivateScholarlyPackage();
  packageShape.parse(input);
  // Structural checks above cover both versions; v2's evidence is checked
  // against the independent bounded ledger below. Return the original object,
  // not a parsed/trimmed copy, so original bytes and metadata survive.
  const pck = input as Prepared;
  const v2 = pck.format === "mateen-source-preparation-v2";
  if (pck.source.rawTextSha256 !== collation.rawTextSha256 ||
      pck.source.version !== `aljam3-${pck.source.rawTextSha256.slice(0, 16)}` ||
      (v2 && (pck.source.publicationStatus !== "blocked_pending_independent_reviews" ||
        pck.source.collationStatus !== "bounded_excerpts_only_rest_excluded" ||
        pck.source.collationEvidence.pdfSha256 !== collation.evidence.pdfSha256 ||
        !Array.isArray(pck.quoteCandidates)))) throw new Error("Invalid preparation scope");
  const ids = new Set<string>();
  let endOffset = -1;
  let viewerPage = -1;
  for (const p of pck.passages) {
    if (p.viewerPage !== viewerPage) endOffset = -1;
    if (!p.text.trim() || p.text.length > 12000 || ids.has(p.id) ||
        p.reviewStatus !== "unreviewed" || p.indexed !== false ||
        (!v2 && (p.printedPage !== null || p.pdfPage !== null)) ||
        p.viewerPage < viewerPage || p.startOffset < endOffset || p.endOffset <= p.startOffset ||
        p.endOffset - p.startOffset !== p.text.length ||
        !Number.isInteger(p.viewerPage) || p.viewerPage < 5 || p.viewerPage > 405 ||
        p.sourceUrl !== `https://aljam3.com/ar/3190/7673/${p.viewerPage}` ||
        createHash("sha256").update(p.text).digest("hex") !== p.textSha256) {
      throw new Error("Invalid prepared commentary passage");
    }
    if (v2 && (p.studentEligible !== false ||
        !["excluded_partial_collation", "excluded_not_collated"].includes(p.transcriptionStatus) ||
        !findCollationPassage(p.text, p.sourceUrl, p.viewerPage, pck))) {
      throw new Error("Invalid bounded collation passage");
    }
    ids.add(p.id);
    endOffset = p.endOffset;
    viewerPage = p.viewerPage;
  }
  if (v2) {
    const corrections = pck.passages.flatMap(p => p.corrections);
    for (const records of [corrections, pck.quoteCandidates]) {
      const recordIds = records.map(r => r.id);
      const ledger = records === corrections ? collation.corrections : collation.candidates;
      if (new Set(recordIds).size !== recordIds.length || recordIds.length !== ledger.length ||
          ledger.some(r => !recordIds.includes(r.id)) ||
          records.some(r => !ids.has(r.passageId))) throw new Error("Incomplete collation ledger");
    }
  }
  return {
    ...pck,
    // Identity follows immutable source bytes, not preparation/correction edits.
    importKey: `aljam3:${pck.source.rawTextSha256}`,
    packageSha256: createHash("sha256").update(JSON.stringify(pck)).digest("hex"),
  };
}
