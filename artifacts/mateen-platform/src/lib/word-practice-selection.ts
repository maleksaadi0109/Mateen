import type { RecitationIssue } from './live-recitation';

export const MAX_PASSAGE = 120;
export const MAX_TARGETS = 20;
export type ReferenceContext = { words: string[]; start: number; end: number };

/** A live attempt span is trusted only when its full local words equal the server's current words. Never remapped. */
export function verifiedSpan(server: readonly string[], ctx: ReferenceContext | null | undefined): { start: number; end: number } | null {
  if (!ctx || !Array.isArray(ctx.words) || ctx.words.length !== server.length) return null;
  if (!ctx.words.every((w, i) => w === server[i])) return null;
  if (!Number.isSafeInteger(ctx.start) || !Number.isSafeInteger(ctx.end) || ctx.start < 0 || ctx.end > server.length || ctx.end <= ctx.start) return null;
  return { start: ctx.start, end: ctx.end };
}

export function validRange(range: { start: number; end: number }, allowed: { start: number; end: number }) {
  const { start, end } = range;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= allowed.start && end <= allowed.end && end > start && end - start <= MAX_PASSAGE;
}

export function toggleTarget(targets: number[], index: number, range: { start: number; end: number } | null): number[] {
  if (targets.includes(index)) return targets.filter((t) => t !== index);
  if (!range || index < range.start || index >= range.end || targets.length >= MAX_TARGETS) return targets;
  return [...targets, index].sort((a, b) => a - b);
}

/** Uncertain suggestions: non-extra ASR differences inside the verified span, hadith-local indices. */
export function suggestTargets(issues: readonly RecitationIssue[], hadithStart: number, span: { start: number; end: number } | null): number[] {
  if (!span) return [];
  const out = new Set<number>();
  for (const i of issues) {
    if (i.kind === 'extra') continue;
    const local = i.index - hadithStart;
    if (Number.isSafeInteger(local) && local >= span.start && local < span.end) out.add(local);
  }
  return [...out].sort((a, b) => a - b);
}
