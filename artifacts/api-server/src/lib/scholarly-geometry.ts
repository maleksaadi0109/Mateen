import { z } from "zod";
import { digest, type findCollationPassage } from "./scholarly-collation";

// Coordinates are manually supplied normalized image bounds, never text offsets.
const rectangle = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  width: z.number().finite().gt(0).max(1),
  height: z.number().finite().gt(0).max(1),
}).strict().refine(r => r.x + r.width <= 1 && r.y + r.height <= 1 && r.width * r.height < 1, "Bounds leave image or cover the whole page");
export const geometryInput = z.object({
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  excerptId: z.string().min(1).max(200),
  imageSha256: z.string().regex(/^[a-f0-9]{64}$/),
  originalTextSha256: z.string().regex(/^[a-f0-9]{64}$/),
  rectangles: z.array(rectangle).max(20),
  note: z.string().trim().min(10).max(2000),
  manuallyVerified: z.literal(true),
}).strict();
const evidence = geometryInput.omit({ manuallyVerified: true, expectedRevision: true }).extend({
  method: z.literal("manual_visual"),
  recordedAt: z.string().datetime(),
  excerptSha256: z.string(),
});
type Comparison = NonNullable<ReturnType<typeof findCollationPassage>>;
export const excerptFingerprint = (excerpt: Comparison["excerpts"][number]) => digest(JSON.stringify(excerpt));

export function geometryHistory(comparison: Comparison, excerptId: string, records: {
  id: string; actorId: string; createdAt: Date; reason: string; details: unknown;
}[]) {
  const excerpt = comparison.excerpts.find(x => x.id === excerptId);
  const selected = records.filter(record =>
    (record.details as { excerptId?: unknown } | null)?.excerptId === excerptId);
  const snapshot = (record: typeof records[number] | undefined) => {
    const parsed = evidence.safeParse(record?.details);
    if (!parsed.success) return null;
    const g = parsed.data;
    return { ...g, imageMatches: g.imageSha256 === comparison.imageSha256,
      textMatches: !!excerpt && g.originalTextSha256 === digest(comparison.originalText) &&
        g.excerptSha256 === excerptFingerprint(excerpt) };
  };
  return selected.map((record, index) => {
    const after = snapshot(record);
    return { id: record.id, actorId: record.actorId, createdAt: record.createdAt.toISOString(),
      reason: record.reason, change: !after ? "invalid" as const :
        after.rectangles.length ? "recorded" as const : "revoked" as const,
      before: snapshot(selected[index + 1]), after };
  });
}
export function currentGeometry(comparison: Comparison, records: { details: unknown }[]) {
  return geometryStates(comparison, records).flatMap(s => s.current?.rectangles.length ? [s.current] : []);
}

// Include revocations and invalid/stale newest records in concurrency tokens.
// Audit IDs keep even otherwise identical records distinct; legacy fixtures use details.
export function geometryStates(comparison: Comparison, records: { id?: string; details: unknown }[]) {
  const seen = new Set<string>();
  const latest = new Map<string, { revision: string; current: z.infer<typeof evidence> | null }>();
  for (const record of records) {
    const id = (record.details as { excerptId?: unknown } | null)?.excerptId;
    if (typeof id !== "string" || seen.has(id)) continue;
    seen.add(id);
    const revision = digest(record.id ?? JSON.stringify(record.details));
    latest.set(id, { revision, current: null });
    const parsed = evidence.safeParse(record.details);
    if (!parsed.success) continue;
    const g = parsed.data;
    const excerpt = comparison.excerpts.find(x => x.id === g.excerptId);
    if (excerpt && g.imageSha256 === comparison.imageSha256 &&
        g.originalTextSha256 === digest(comparison.originalText) &&
        g.excerptSha256 === excerptFingerprint(excerpt)) latest.set(id, { revision, current: g });
  }
  return comparison.excerpts.map(excerpt => ({
    excerptId: excerpt.id, revision: latest.get(excerpt.id)?.revision ?? null,
    current: latest.get(excerpt.id)?.current ?? null,
  }));
}
