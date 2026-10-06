import { eq } from "drizzle-orm";
import { dailyPlansTable, type db, type ScheduledReviewRecord } from "@workspace/db";
import type { DailyPlanTask } from "@workspace/api-zod";
import { reviewHash, reviewKey } from "./daily-plan-sources";
import { studyDay } from "./study-activity-policy";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Called only by the existing review-answer transaction, under its profile lock.
 * Attribute one review submission to one task; a midnight replay never finishes two days.
 */
export async function finishDailyReview(tx: Tx, review: ScheduledReviewRecord, now: Date) {
  const plans = await tx.select().from(dailyPlansTable).where(eq(dailyPlansTable.userId, review.userId));
  const matches = plans.flatMap(plan => (plan.tasks as DailyPlanTask[]).filter(task =>
    task.kind === "confirmed_review" && task.sourceKey === reviewKey(review) &&
    task.sourceHash === reviewHash(review) && ["started", "pending"].includes(task.status) &&
    (task.status === "started" || plan.day === studyDay(now, plan.timezone)),
  ).map(task => ({ plan, task })));
  matches.sort((a, b) => Number(b.task.status === "started") - Number(a.task.status === "started") ||
    (b.task.startedAt ?? b.plan.createdAt.toISOString()).localeCompare(a.task.startedAt ?? a.plan.createdAt.toISOString()));
  const match = matches[0];
  if (!match) return;
  const tasks = (match.plan.tasks as DailyPlanTask[]).map(task => task.id === match.task.id ?
    { ...task, status: "completed" as const, completedAt: now.toISOString() } : task);
  await tx.update(dailyPlansTable).set({ tasks, revision: match.plan.revision + 1 }).where(eq(dailyPlansTable.id, match.plan.id));
}
