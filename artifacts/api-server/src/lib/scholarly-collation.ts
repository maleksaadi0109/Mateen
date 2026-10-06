import { createHash } from "node:crypto";
import { getPrivateScholarlyPackage } from "./private-scholarly-data";
import type { Prepared } from "./private-scholarly-types";

export const digest = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");

function checkEvidence(evidence: Prepared["quoteCandidates"][number]["evidence"],
  passage: Prepared["passages"][number], location: string) {
  const { collation } = getPrivateScholarlyPackage();
  const page = collation.pages.find(page => page.viewerPage === passage.viewerPage);
  if (!page || evidence.viewerPage !== page.viewerPage || evidence.pdfPage !== page.pdfPage ||
      evidence.printedPage !== page.printedPage || evidence.imageFile !== page.imageFile ||
      evidence.imageSha256 !== page.imageSha256 || evidence.location !== location ||
      evidence.pdfSha256 !== collation.evidence.pdfSha256 || evidence.pdfUrl !== collation.evidence.pdfUrl) {
    throw new Error("Changed excerpt evidence");
  }
}

// Compare immutable originals, not titles/pages alone or corrected text.
export function findCollationPassage(text: string, sourceUrl: string | null, viewerPage: number | null,
  bundle = getPrivateScholarlyPackage().prepared) {
  const prepared = bundle;
  const { collation } = getPrivateScholarlyPackage();
  if (prepared.format !== "mateen-source-preparation-v2" ||
      collation.format !== "mateen-transcription-collation-v1" ||
      prepared.source.rawTextSha256 !== collation.rawTextSha256 ||
      collation.scientificApproval !== null || prepared.source.scientificApproval !== null) {
    throw new Error("Invalid collation package");
  }
  const matches = prepared.passages.filter(p =>
    p.text.trim() === text.trim() && p.sourceUrl === sourceUrl && p.viewerPage === viewerPage);
  if (matches.length !== 1) return null;
  const p = matches[0];
  if (digest(p.text) !== p.textSha256 || p.studentEligible !== false ||
      p.indexed !== false || p.reviewStatus !== "unreviewed") throw new Error("Changed original");
  if (p.correctedDraft !== null && digest(p.correctedDraft) !== p.correctedDraftSha256) {
    throw new Error("Changed correction draft");
  }
  let corrected = p.text;
  let nextStart = p.text.length;
  for (const c of [...p.corrections].sort((a, b) => b.originalStart - a.originalStart)) {
    if (!Number.isInteger(c.originalStart) || !Number.isInteger(c.originalEnd) ||
        c.originalStart < 0 || c.originalEnd <= c.originalStart || c.originalEnd > nextStart ||
        c.passageId !== p.id) throw new Error("Invalid correction bounds");
    nextStart = c.originalStart;
    corrected = corrected.slice(0, c.originalStart) + c.after + corrected.slice(c.originalEnd);
  }
  if (p.correctedDraft !== (p.corrections.length ? corrected : null)) {
    throw new Error("Correction draft exceeds inspected bounds");
  }
  const corrections = p.corrections.map(c => {
    checkEvidence(c.evidence, p, c.location);
    const record = collation.corrections.find(r => r.id === c.id);
    if (!record || record.passageId !== p.id || record.before !== c.before || record.after !== c.after ||
        record.pdfPage !== c.pdfPage || record.location !== c.location || record.reason !== c.reason ||
        p.text.slice(c.originalStart, c.originalEnd) !== c.before ||
        digest(c.before) !== c.beforeSha256 || digest(c.after) !== c.afterSha256) {
      throw new Error("Changed correction bounds");
    }
    return {
      id: c.id, originalText: c.before, correctedText: c.after,
      originalStart: c.originalStart, originalEnd: c.originalEnd,
      location: c.location, difference: c.reason,
      scope: "هذا الموضع المحدد فقط؛ لا يشمل الحكم كامل المقطع أو الصفحة.",
    };
  });
  const candidates = prepared.quoteCandidates.filter(c => c.passageId === p.id).map(c => {
    checkEvidence(c.evidence, p, c.location);
    const record = collation.candidates.find(r => r.id === c.id);
    if (!record || record.originalText !== c.originalText || record.text !== c.text ||
        record.passageId !== p.id || record.scope !== c.scope || record.location !== c.location ||
        record.difference !== c.difference || record.pdfPage !== c.pdfPage ||
        p.text.slice(c.originalStart, c.originalEnd) !== c.originalText ||
        digest(c.originalText) !== c.originalTextSha256 || digest(c.text) !== c.textSha256 ||
        !Number.isInteger(c.originalStart) || !Number.isInteger(c.originalEnd) ||
        c.originalStart < 0 || c.originalEnd <= c.originalStart || c.originalEnd > p.text.length ||
        c.scientificApproval !== null || c.studentEligible !== false ||
        c.indexed !== false || c.reviewStatus !== "unreviewed" ||
        c.transcriptionStatus !== "visually_compared_excerpt_only") throw new Error("Changed excerpt bounds");
    let draft = c.originalText;
    let end = draft.length;
    for (const change of [...c.changes].sort((a, b) => b.originalStart - a.originalStart)) {
      if (!Number.isInteger(change.originalStart) || !Number.isInteger(change.originalEnd) ||
          change.originalStart < 0 || change.originalEnd < change.originalStart || change.originalEnd > end ||
          c.originalText.slice(change.originalStart, change.originalEnd) !== change.before) {
        throw new Error("Changed candidate edit bounds");
      }
      end = change.originalStart;
      draft = draft.slice(0, change.originalStart) + change.after + draft.slice(change.originalEnd);
    }
    if (draft !== c.text) throw new Error("Candidate text exceeds edit bounds");
    return {
      id: c.id, originalText: c.originalText, correctedText: c.text,
      originalStart: c.originalStart, originalEnd: c.originalEnd,
      location: c.location, difference: c.difference, scope: c.scope,
    };
  });
  const page = collation.pages.find(page => page.viewerPage === p.viewerPage) ?? null;
  if (!page && (p.pdfPage !== null || p.printedPage !== null || p.pageEvidence != null)) {
    throw new Error("Uninspected pagination");
  }
  if (page && (page.pdfPage !== p.pdfPage || page.printedPage !== p.printedPage ||
      page.imageFile !== p.pageEvidence?.imageFile || page.imageSha256 !== p.pageEvidence?.imageSha256)) {
    throw new Error("Changed page evidence");
  }
  const exclusion = collation.exclusions.find(e => e.passageId === p.id)?.reason ?? collation.defaultExclusionReason;
  if (p.exclusionReason !== exclusion) throw new Error("Changed exclusion scope");
  return {
    originalText: p.text, correctedDraft: p.correctedDraft, exclusionReason: exclusion,
    viewerPage: p.viewerPage, pdfPage: page?.pdfPage ?? null, printedPage: page?.printedPage ?? null,
    imageSha256: page?.imageSha256 ?? null, imageAvailable: page !== null,
    excerpts: [...corrections, ...candidates], limitations: collation.limitations,
    paginationNote: collation.evidence.paginationNote,
    imageFile: page?.imageFile.split("/").pop() ?? null,
  };
}

export function isCollationSource(source: {
  importKey: string | null; version: string; preparationMetadata: unknown;
}) {
  const metadata = source.preparationMetadata as { rawTextSha256?: unknown } | null;
  return source.importKey?.startsWith("aljam3:") === true &&
    source.version === getPrivateScholarlyPackage().prepared.source.version &&
    metadata?.rawTextSha256 === getPrivateScholarlyPackage().collation.rawTextSha256;
}
