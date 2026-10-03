import { SavePracticeReportBody } from "@workspace/api-zod";

/** Strict allowlist: neither transcripts, audio, ownership nor grades are accepted. */
export const practiceReportInput = SavePracticeReportBody.extend({
  analyses: SavePracticeReportBody.shape.analyses.element.strict().array().min(1).max(42),
  issues: SavePracticeReportBody.shape.issues.element.strict().array().max(20000),
}).strict().superRefine((v, ctx) => {
  const invalid = () => ctx.addIssue({ code: "custom", message: "Inconsistent or incomplete practice report" });
  const ids = new Set<number>(), numbers = new Set<number>();
  let lastEnd = -1;
  for (const a of v.analyses) {
    if (ids.has(a.id) || numbers.has(a.number) || a.start < lastEnd || a.end <= a.start ||
      a.totalWords > a.end - a.start || a.covered > a.totalWords || a.matched > a.covered ||
      a.covered !== a.matched + a.substitutions + a.omissions ||
      a.attempted !== a.matched + a.substitutions + a.omissions + a.extras ||
      a.heard !== a.matched + a.substitutions + a.extras ||
      a.successPercent !== Math.round(100 * a.matched / a.attempted) ||
      a.differencePercent !== 100 - a.successPercent) invalid();
    ids.add(a.id); numbers.add(a.number); lastEnd = a.end;
    const issues = v.issues.filter(i => i.index >= a.start && i.index < a.end);
    for (const kind of ["substitution", "omission", "extra"] as const) {
      const count = issues.filter(i => i.kind === kind).length;
      const expected = a[kind === "substitution" ? "substitutions" : kind === "omission" ? "omissions" : "extras"];
      if (count > expected || (v.complete && count !== expected)) invalid();
    }
    // A reference location cannot be both substituted and omitted.
    const referenceIndices = issues.filter(i => i.kind !== "extra").map(i => i.index);
    if (new Set(referenceIndices).size !== referenceIndices.length) invalid();
  }
  if (v.matched !== v.analyses.reduce((n, a) => n + a.matched, 0) ||
      v.attempted !== v.analyses.reduce((n, a) => n + a.attempted, 0)) invalid();
  for (const i of v.issues) {
    if (!v.analyses.some(a => i.index >= a.start && i.index < a.end)) invalid();
    // Words only, never a sentence or full recognized passage.
    for (const word of [i.expected, i.heard]) if (/\s/.test(word)) invalid();
    if ((i.kind === "omission" && (i.heard !== "" || !i.expected)) ||
        (i.kind === "extra" && !i.heard) ||
        (i.kind === "substitution" && (!i.expected || !i.heard))) invalid();
  }
});