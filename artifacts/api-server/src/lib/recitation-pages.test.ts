import assert from "node:assert/strict";
import test from "node:test";
import data from "../data/nawawi-page-map.json";
import { validatePageMap, pageWords } from "./recitation-pages";
import { canonicalMatnRecords } from "./canonical-matn";

test("all 42 mappings bind the actual training text, not the surrounding narration", () => {
  const map = validatePageMap(data);
  for (const h of map.hadiths) {
    assert.equal(h.canonicalText ?? h.text, canonicalMatnRecords.find(c => c.id === h.hadithId)!.text);
  }
  assert.equal(map.rightsSourceVersionId, null);
  assert.ok(map.pages.every(p => p.objectPath?.startsWith("/objects/nawawi-scans/")));
  const first = map.hadiths[0];
  assert.equal(first.regions.flatMap(r=>r.wordIndices).length, pageWords(first.text).length);
  assert.ok(first.text.startsWith("عن أمير المؤمنين أبي حفص عمر بن الخطاب"));
  assert.equal(first.title,"لا عمل إلا بنية");
  assert.equal(first.unmappedIndices.length, 0);
  assert.equal(first.verification, "visually-checked");
  assert.ok(map.hadiths.slice(1).every(h => h.verification === "pending" && h.regions.length === 0));
});

test("invalid crops, missing tokens, stale text and duplicates fail closed", () => {
  for (const mutate of [
    (m: typeof data) => { m.hadiths[0].text += " changed"; },
    (m: typeof data) => { m.hadiths[0].regions[0].width = 999; },
    (m: typeof data) => { m.hadiths[0].regions[0].wordIndices = [999]; },
    (m: typeof data) => { m.hadiths[0].regions[1].wordIndices = [0]; },
    (m: typeof data) => { m.hadiths[0].regions.pop(); },
    (m: typeof data) => { m.pages[1].page = 1; },
    (m: typeof data) => { m.hadiths[1].hadithId = 1; },
  ]) {
    const copy = structuredClone(data);
    mutate(copy);
    assert.throws(() => validatePageMap(copy));
  }
});