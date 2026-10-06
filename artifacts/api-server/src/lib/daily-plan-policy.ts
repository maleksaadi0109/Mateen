import type { DailyPlanTask } from "@workspace/api-zod";

export type Candidate = Omit<DailyPlanTask, "id" | "minutes" | "status" | "startedAt" | "completedAt">;
export type Goal = "memorize" | "review" | "both";
export const MAX_TASKS = 4;

/** At most two confirmed reviews first; reserve variety for learning goals.
 * No carryover-day bundles, bookmarks, recognizer alerts, age or self-reported mastery.
 * Five minutes is a suggested activity block, not a content completion promise.
 */
export function distribute(candidates: Candidate[], goal: Goal, minutes: number, retained: DailyPlanTask[] = []) {
  const used = new Set(retained.map(t => t.sourceKey));
  const unique = candidates.filter(c => !used.has(c.sourceKey) && (used.add(c.sourceKey), true));
  const reviews = unique.filter(c => c.kind === "confirmed_review");
  const practices = unique.filter(c => c.kind === "word_practice");
  const learning = goal === "review" ? [] : unique.filter(c => c.kind === "new_learning");
  const ordered = [...reviews.slice(0, learning.length ? 1 : 2), ...learning.slice(0, 1), ...practices.slice(0, 1), ...reviews.slice(learning.length ? 1 : 2)];
  let left = Math.max(0, minutes - retained.reduce((n, t) => n + t.minutes, 0));
  const selected: { candidate: Candidate; minutes: number }[] = [];
  for (const candidate of ordered) {
    if (left < 5 || selected.length + retained.length >= MAX_TASKS) break;
    // No more than two review tasks, even after long absence.
    if (candidate.kind === "confirmed_review" && selected.filter(t => t.candidate.kind === "confirmed_review").length +
      retained.filter(t => t.kind === "confirmed_review").length >= 2) continue;
    selected.push({ candidate, minutes: 5 }); left -= 5;
  }
  return selected;
}
