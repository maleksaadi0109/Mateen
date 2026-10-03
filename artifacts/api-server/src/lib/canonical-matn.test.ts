import assert from "node:assert/strict";
import test from "node:test";
import nawawiRecords from "../data/nawawi.json";
import {
  canonicalMatnBoundaries,
  canonicalMatnRecords,
  extractCanonicalMatnRecords,
} from "./canonical-matn.js";

type SourceRecord = (typeof nawawiRecords)[number];

function occurrences(text: string, anchor: string): number {
  return text.split(anchor).length - 1;
}

test("maps all 42 Nawawi entries through unique explicit source boundaries", () => {
  assert.equal(canonicalMatnRecords.length, 42);
  assert.equal(new Set(canonicalMatnRecords.map(({ id }) => id)).size, 42);
  assert.deepEqual(canonicalMatnRecords.map(({ number }) => number), Array.from({ length: 42 }, (_, i) => i + 1));
  assert.equal(canonicalMatnBoundaries.length, 42);
  assert.ok(Object.isFrozen(canonicalMatnRecords));

  for (const boundary of canonicalMatnBoundaries) {
    const raw = nawawiRecords.find((record) => record.id === boundary.id) as SourceRecord | undefined;
    const extracted = canonicalMatnRecords.find((record) => record.id === boundary.id);
    assert.ok(raw, `missing source record ${boundary.id}`);
    assert.ok(extracted, `missing extracted record ${boundary.id}`);
    assert.equal(occurrences(raw.text, boundary.start), 1, `start anchor ${boundary.id} is not unique`);
    assert.equal(occurrences(raw.text, boundary.end), 1, `end anchor ${boundary.id} is not unique`);
    const start = raw.text.indexOf(boundary.start);
    const end = raw.text.indexOf(boundary.end) + boundary.end.length;
    assert.ok(end > start, `invalid range for record ${boundary.id}`);
    assert.equal(extracted.text, raw.text.slice(start, end), `record ${boundary.id} is not an exact source slice`);
    assert.ok(raw.text.includes(extracted.text), `record ${boundary.id} is not a source substring`);
    assert.equal(extracted.sourcePage, raw.sourcePage);
    assert.equal(extracted.sourceUrl, raw.sourceUrl);
    assert.equal(extracted.title, raw.title);
    assert.ok(Object.isFrozen(extracted));
  }
});

test("excludes narrators, grading/editorial footers, and alternate report wording", () => {
  for (const record of canonicalMatnRecords) {
    assert.ok(!record.text.startsWith("«عن "), `record ${record.id} begins with narrator chain`);
    assert.ok(!/رواه|حديث حسن|وفي رواية|رويناه/u.test(record.text), `record ${record.id} includes editorial or alternate wording`);
  }

  const secondHadith = canonicalMatnRecords.find(({ id }) => id === 2)!.text;
  assert.ok(secondHadith.startsWith("بينما نحن جلوس عند رسول الله"));
  assert.ok(secondHadith.includes("فقال رسول الله ﵌: الإسلام"));
  assert.ok(secondHadith.includes("ثم قال يا عمر أتدري من السائل؟"));
  assert.ok(!secondHadith.includes("رواه مسلم"));

  const hadith27 = canonicalMatnRecords.find(({ id }) => id === 27)!.text;
  assert.ok(hadith27.includes("البر حسن الخلق"));
  assert.ok(!hadith27.includes("وعن وابصة"));
  assert.ok(!hadith27.includes("إستفت قلبك"));
  const hadith40 = canonicalMatnRecords.find(({ id }) => id === 40)!.text;
  assert.ok(!hadith40.includes("وكان ابن عمر"));
});

test("retains source-internal Quran quotation and nested report dialogue", () => {
  const hadith10 = canonicalMatnRecords.find(({ id }) => id === 10)!.text;
  assert.ok(hadith10.includes("﴿يا أيها الرسل كلوا من الطيبات واعملوا صالحا﴾"));
  assert.ok(hadith10.includes("﴿يا أيها الذين آمنوا كلوا من طيبات ما رزقناكم﴾"));

  const hadith29 = canonicalMatnRecords.find(({ id }) => id === 29)!.text;
  assert.ok(hadith29.includes("﴿تتجافى جنوبهم عن المضاجع﴾"));
  assert.ok(hadith29.includes("﴿حتى إذا بلغ﴾"));
  assert.ok(hadith29.includes("﴿يعملون﴾"));
  assert.ok(hadith29.includes("قلت: بلى يا رسول الله"));
});

test("provides at least 30 distinct real completion windows without padding short reports", () => {
  const windows: Array<{ cue: string; expected: string; number: number }> = [];
  for (const record of canonicalMatnRecords) {
    const words = record.text.trim().split(/\s+/u).filter(Boolean);
    // Eight cue tokens followed by eight expected tokens, advancing by a full window.
    for (let start = 0; start + 16 <= words.length; start += 16) {
      windows.push({
        cue: words.slice(start, start + 8).join(" "),
        expected: words.slice(start + 8, start + 16).join(" "),
        number: record.number,
      });
    }
  }
  assert.ok(windows.length >= 30, `only ${windows.length} non-overlapping source windows are available`);
  assert.ok(windows.some(({ number }) => number === 2));
  assert.ok(windows.some(({ number }) => number === 29));
  assert.ok(windows.filter(({ number }) => number === 2).length > 1);
  assert.ok(windows.filter(({ number }) => number === 29).length > 1);
  assert.equal(windows.some(({ number }) => number === 41), false, "short report must not be padded");
  for (const window of windows) {
    const record = canonicalMatnRecords.find(({ number }) => number === window.number)!;
    assert.ok(record.text.replace(/\s+/gu, " ").includes(`${window.cue} ${window.expected}`));
    assert.ok(window.cue.split(/\s+/u).length === 8);
    assert.ok(window.expected.split(/\s+/u).length === 8);
  }
});

test("fails closed on missing or ambiguous anchors instead of falling back to raw entry text", () => {
  const missingAnchor = nawawiRecords.map((record) => ({ ...record }));
  const firstSource = missingAnchor.find(({ id }) => id === 1)!;
  const firstBoundary = canonicalMatnBoundaries.find(({ id }) => id === 1)!;
  firstSource.text = firstSource.text.replace(firstBoundary.start, "");
  assert.throws(() => extractCanonicalMatnRecords(missingAnchor), /missing or ambiguous start anchor/u);

  const ambiguousAnchor = nawawiRecords.map((record) => ({ ...record }));
  const ambiguousSource = ambiguousAnchor.find(({ id }) => id === 1)!;
  ambiguousSource.text = `${ambiguousSource.text} ${firstBoundary.start}`;
  assert.throws(() => extractCanonicalMatnRecords(ambiguousAnchor), /missing or ambiguous start anchor/u);
});