import type { Citation } from "@workspace/api-zod";

/** Only known published reference viewers, never arbitrary uploaded/evidence URLs.
 * Adding a publisher requires an explicit public-link policy, not a URL guess.
 */
export function publicReferenceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1000) return null;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port || url.hash) return null;
    if (url.hostname === "aljam3.com" && /^\/ar\/3190\/7673\/[1-9]\d*$/.test(url.pathname) && !url.search) return url.href;
    if (url.hostname === "turath.io" && /^\/book\/[1-9]\d*$/.test(url.pathname) &&
        (!url.search || /^\?page=[1-9]\d*$/.test(url.search))) return url.href;
  } catch { /* Invalid URL is not a public reference. */ }
  return null;
}

export function currentCitationStates(
  citations: Pick<Citation, "sourceId" | "sourceVersion">[],
  sources: { id: string; status: string; version: string }[],
  checkedAt = new Date(),
) {
  return [...new Set(citations.map(c => c.sourceId))].map(sourceId => {
    const source = sources.find(s => s.id === sourceId);
    const versions = citations.filter(c => c.sourceId === sourceId).map(c => c.sourceVersion);
    return {
      sourceId,
      state: !source ? "unavailable" : source.status === "indexed" ? "eligible" :
        source.status === "withdrawn" ? "withdrawn" : "ineligible",
      versionChanged: !source || versions.some(v => v == null) ? null : versions.some(v => v !== source.version),
      checkedAt,
    };
  });
}
