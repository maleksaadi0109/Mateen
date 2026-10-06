import assert from "node:assert/strict";
import { test } from "node:test";
import { distribute, type Candidate, type Goal } from "./daily-plan-policy";
import { studyDay } from "./study-activity-policy";
import type { DailyPlanTask } from "@workspace/api-zod";

const candidate = (kind: Candidate["kind"], n: number): Candidate => ({
  kind, sourceKey: `${kind}:${n}`, sourceHash: "hash", title: "عنوان", reason: "سبب", href: "/student",
});
const queues = [...Array.from({ length: 100 }, (_, i) => candidate("confirmed_review", i)),
  candidate("word_practice", 1), candidate("new_learning", 1), candidate("new_learning", 2)];
for (const goal of ["memorize", "review", "both"] as Goal[]) {
  for (const minutes of [10, 15, 30, 45, 60]) {
    test(`${goal}/${minutes}: bounded stable deduplicated priorities after absence`, () => {
      const result = distribute([...queues, ...queues], goal, minutes);
      assert.ok(result.reduce((n, t) => n + t.minutes, 0) <= minutes);
      assert.ok(result.length <= 4);
      assert.ok(result.filter(t => t.candidate.kind === "confirmed_review").length <= 2);
      assert.equal(new Set(result.map(t => t.candidate.sourceKey)).size, result.length);
      assert.deepEqual(result, distribute(queues, goal, minutes));
      assert.equal(result[0].candidate.kind, "confirmed_review");
      assert.equal(result.some(t => t.candidate.kind === "new_learning"), goal !== "review");
    });
  }
}
test("ten minutes distributes review + learning without a selected word exercise", () => {
  assert.deepEqual(distribute([queues[0], candidate("new_learning", 1)], "both", 10).map(t => [t.candidate.kind, t.minutes]),
    [["confirmed_review", 5], ["new_learning", 5]]);
});
test("empty does not invent content; completed work consumes budget without duplication", () => {
  assert.deepEqual(distribute([], "memorize", 60), []);
  const retained: DailyPlanTask = { ...candidate("new_learning", 1), id: "id", minutes: 15, status: "completed", startedAt: "time", completedAt: "time" };
  assert.deepEqual(distribute(queues, "both", 10, [retained]), []);
  assert.ok(distribute(queues, "both", 30, [retained]).every(t => t.candidate.sourceKey !== retained.sourceKey));
});
test("fixed calendar handles midnight, travel and 23/25-hour DST days", () => {
  assert.equal(studyDay(new Date("2026-03-08T04:59:59Z"), "America/New_York"), "2026-03-07");
  assert.equal(studyDay(new Date("2026-03-08T05:00:00Z"), "America/New_York"), "2026-03-08");
  assert.equal(studyDay(new Date("2026-03-09T04:00:00Z"), "America/New_York"), "2026-03-09");
  assert.equal(studyDay(new Date("2026-11-01T04:00:00Z"), "America/New_York"), "2026-11-01");
  assert.equal(studyDay(new Date("2026-11-02T05:00:00Z"), "America/New_York"), "2026-11-02");
});
