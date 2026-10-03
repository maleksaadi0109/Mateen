import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import data from "../data/nawawi-page-map.json";
import { validatePageMap, pageWords } from "./recitation-pages";
import { canonicalMatnRecords } from "./canonical-matn";

test("all 42 sanad-first mappings preserve the independent assessment reference", () => {
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
  const corrections = JSON.parse(readFileSync(new URL("../../../../attached_assets/nawawi-page-source/corrections.json", import.meta.url), "utf8"));
  for (const h of map.hadiths) {
    assert.equal(h.verification, "visually-checked");
    assert.ok(h.title && h.heading && h.canonicalText);
    assert.ok(h.text.startsWith("عن "));
    assert.deepEqual(h.unmappedIndices, []);
    assert.deepEqual(h.regions.flatMap(r => r.wordIndices), pageWords(h.text).map((_, i) => i));
    for (const field of ["text", "canonicalText", "title", "heading", "regions", "verification"] as const)
      assert.deepEqual(h[field], corrections[h.hadithId][field]);
    const raw = data.hadiths.find(v => v.hadithId === h.hadithId)!;
    const usedPages = h.regions.map(r => r.page).concat(h.heading!.page);
    assert.deepEqual(raw.pageRange, [Math.min(...usedPages), Math.max(...usedPages)]);
  }
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
    (m: typeof data) => { m.hadiths[1].canonicalText += " changed"; },
    (m: typeof data) => { m.hadiths[1].regions.reverse(); },
  ]) {
    const copy = structuredClone(data);
    mutate(copy);
    assert.throws(() => validatePageMap(copy));
  }
});

test("edition wording is independent and excluded reports do not enter practice", () => {
  const map = validatePageMap(data);
  const text = (id: number) => map.hadiths.find(h => h.hadithId === id)!.text;
  assert.match(text(2), /عن عمر رضي الله عنه أيضا قال بينما/);
  assert.match(text(10), /ومشربه حرام/);
  assert.ok(text(19).endsWith("وجفت الصحف"));
  assert.ok(text(27).endsWith("نفسك وكرهت أن يطلع عليه الناس"));
  assert.ok(text(37).endsWith("كتبها الله سيئة واحدة"));
  assert.ok(text(40).endsWith("كأنك غريب أو عابر سبيل"));
  assert.ok(!text(27).includes("وابصة"));
  assert.ok(!text(37).includes("فانظر"));
  assert.ok(!text(40).includes("إذا أمسيت"));
});

test("a declared alignment gap remains a technical gap, not an invented word region", () => {
  const copy = validatePageMap(structuredClone(data));
  const removed = copy.hadiths[1].regions.splice(2, 1)[0];
  copy.hadiths[1].unmappedIndices.push(...removed.wordIndices);
  const validated = validatePageMap(copy);
  assert.deepEqual(validated.hadiths[1].unmappedIndices, removed.wordIndices);
});