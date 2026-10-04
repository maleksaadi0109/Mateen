import assert from "node:assert/strict";
import { test } from "node:test";
import { activitySummary, canonicalTimezone, qualifiesActivity, studyDay } from "./study-activity-policy";

test("fixed account timezone and local midnight, including year boundary", () => {
  assert.equal(canonicalTimezone("not/a-zone"), null);
  assert.equal(studyDay(new Date("2026-12-31T20:59:59Z"), "Asia/Riyadh"), "2026-12-31");
  assert.equal(studyDay(new Date("2026-12-31T21:00:00Z"), "Asia/Riyadh"), "2027-01-01");
  assert.equal(studyDay(new Date("2026-01-01T03:00:00Z"), "America/New_York"), "2025-12-31");
});
test("today/yesterday continuation, gaps, duplicates and longest history", () => {
  const days = ["2026-10-01", "2026-10-02", "2026-10-02"];
  assert.deepEqual(activitySummary(days, "UTC", new Date("2026-10-03T12:00:00Z")), {
    timezone: "UTC", today: "2026-10-03", currentStreak: 2, longestStreak: 2,
    activeDays: 2, studiedToday: false, lastStudyDay: "2026-10-02",
  });
  assert.equal(activitySummary(days, "UTC", new Date("2026-10-04T00:00:00Z")).currentStreak, 0);
  assert.equal(activitySummary([...days, "2026-10-04"], "UTC", new Date("2026-10-04T12:00:00Z")).currentStreak, 1);
  assert.equal(activitySummary([], null).activeDays, 0);
});
test("DST spring 23h day and autumn 25h day use calendar adjacency", () => {
  for (const [days, now] of [
    [["2026-03-07", "2026-03-08", "2026-03-09"], "2026-03-09T12:00:00Z"],
    [["2026-10-31", "2026-11-01", "2026-11-02"], "2026-11-02T12:00:00Z"],
  ] as const) assert.equal(activitySummary([...days], "America/New_York", new Date(now)).currentStreak, 3);
  assert.equal(studyDay(new Date("2026-11-01T05:30:00Z"), "America/New_York"),
    studyDay(new Date("2026-11-01T06:30:00Z"), "America/New_York"));
});
test("meaningful thresholds reject page opens, fast clicks, silence, wrong elapsed time and expiry", () => {
  const startedAt = new Date("2026-01-01T00:00:00Z");
  const now = new Date("2026-01-01T00:00:30Z");
  const reading = { startedAt, kind: "reading", page: 1 };
  const evidence = { page: 2, activeSeconds: 30, spokenWords: 0 };
  assert.equal(qualifiesActivity(reading, evidence, now), true);
  assert.equal(qualifiesActivity(reading, { ...evidence, page: 1 }, now), false);
  assert.equal(qualifiesActivity(reading, { ...evidence, activeSeconds: 29 }, now), false);
  assert.equal(qualifiesActivity(reading, evidence, new Date(startedAt.getTime() + 29000)), false);
  assert.equal(qualifiesActivity(reading, evidence, new Date(startedAt.getTime() + 7200001)), false);
  const recitation = { ...reading, kind: "recitation" };
  assert.equal(qualifiesActivity(recitation, { ...evidence, activeSeconds: 5, spokenWords: 5 }, now), true);
  assert.equal(qualifiesActivity(recitation, { ...evidence, spokenWords: 4 }, now), false);
  assert.equal(qualifiesActivity(recitation, evidence, now), false);
});