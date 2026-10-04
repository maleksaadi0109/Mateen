export const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export function canonicalTimezone(value: string): string | null {
  try { return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone; }
  catch { return null; }
}

export function studyDay(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (key: string) => parts.find(p => p.type === key)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// Calendar ordinals, not elapsed hours: handles 23/25-hour days and year boundaries.
const ordinal = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;
export function activitySummary(days: string[], timezone: string | null, now = new Date()) {
  const today = timezone ? studyDay(now, timezone) : null;
  const current = today ? ordinal(today) : 0;
  const sorted = [...new Set(days)].filter(d => ordinal(d) <= current).sort();
  const ordinals = new Set(sorted.map(ordinal));
  let currentStreak = 0, longestStreak = 0, run = 0, previous = -Infinity;
  for (const d of sorted) {
    const n = ordinal(d);
    run = n === previous + 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run); previous = n;
  }
  let cursor = ordinals.has(current) ? current : current - 1;
  while (ordinals.has(cursor)) { currentStreak++; cursor--; }
  return { timezone, today, currentStreak, longestStreak, activeDays: sorted.length,
    studiedToday: ordinals.has(current), lastStudyDay: sorted.at(-1) ?? null };
}

export function qualifiesActivity(
  session: { kind: string; page: number; startedAt: Date },
  evidence: { page: number; activeSeconds: number; spokenWords: number },
  now: Date,
) {
  const elapsed = now.getTime() - session.startedAt.getTime();
  if (elapsed < 0 || elapsed > SESSION_TTL_MS || evidence.activeSeconds * 1000 > elapsed) return false;
  return session.kind === "reading"
    ? evidence.activeSeconds >= 30 && evidence.page !== session.page && evidence.spokenWords === 0
    : session.kind === "recitation" && elapsed >= 5000 && evidence.activeSeconds >= 5 && evidence.spokenWords >= 5;
}