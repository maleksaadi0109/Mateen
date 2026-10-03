import assert from "node:assert/strict";
import { it } from "node:test";
import {
  answerNawawiExcerpt, chooseShortExcerpt, EXCERPT_NOTICE,
  parseCommentaryPage, ScholarlyExcerptUnavailableError,
} from "./scholarly-excerpts";
import { selectNawawiHadithNumber, wantsNawawiExcerpt } from "./scholarly-study-context";

const paragraph = "شرح اصطناعي لأغراض الاختبار فقط، يوضح معنى العبارة دون نسبتها إلى عالم أو مصدر حقيقي.";
function page(viewer = 3, heading = "الأول") {
  return `<div class="nass margin-top-10" data-page-id="${viewer}" data-page-num="7">
    <p>[الحديث ${heading}]</p><p>${paragraph}<script>unsafe()</script></p>
    <p>(١) هامش اصطناعي ينبغي ألا يدخل في المقتطف المخصص للشرح</p></div>`;
}

it("reads only the exact source-page container and separates printed/viewer page numbers", () => {
  const result = parseCommentaryPage(page(), 21812, 3);
  assert.equal(result.printedPage, "7");
  assert.equal(result.headingNumber, 1);
  assert.deepEqual(result.paragraphs, [paragraph]);
  assert.equal(result.url, "https://shamela.ws/book/21812/3");
  for (const html of [page(4), page() + page(), "<p>لا يوجد نص مصدر</p>"]) {
    assert.throws(() => parseCommentaryPage(html, 21812, 3), ScholarlyExcerptUnavailableError);
  }
  assert.throws(() => parseCommentaryPage(page(), 9999, 3), ScholarlyExcerptUnavailableError);
});

it("keeps quotations exact and under 70 words per book without model paraphrasing", () => {
  const result = parseCommentaryPage(page(), 21812, 3);
  assert.equal(chooseShortExcerpt("اشرح الحديث الأول", 1, [result]).quote, paragraph);
  const long = Array.from({ length: 100 }, () => "اختبار").join(" ");
  const clipped = chooseShortExcerpt("اشرح الحديث", 2, [{ ...result, paragraphs: [long] }]);
  assert.equal(clipped.quote, `${long.split(" ").slice(0, 70).join(" ")} …`);
});

it("supports both grammatical forms of compound numbered chapter headings", () => {
  assert.equal(selectNawawiHadithNumber("الحديث الحادي والعشرين"), 21);
  assert.equal(selectNawawiHadithNumber("الحديث الواحد والعشرون"), 21);
  assert.equal(selectNawawiHadithNumber("اشرح أول حديث في الأربعين النووية"), 1);
  assert.equal(selectNawawiHadithNumber("الحديث رقم ٩٩"), null);
  assert.equal(wantsNawawiExcerpt("اشرح الحديث رقم ٩٩"), true);
  assert.equal(wantsNawawiExcerpt("اشرح الحديث في الأربعين"), true);
  assert.equal(wantsNawawiExcerpt("كيف أنظم وقت الدراسة؟"), false);
});

it("fetches only allowlisted reference pages, with redirects refused and real source labels", async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.origin, "https://shamela.ws");
    assert.match(parsed.pathname, /^\/book\/(?:21812|11325)\/[1-9]\d{0,2}$/);
    assert.equal(options?.redirect, "error");
    assert.ok(options?.signal);
    urls.push(parsed.href);
    const viewer = Number(parsed.pathname.split("/").at(-1));
    return new Response(page(viewer), { headers: { "Content-Type": "text/html" } });
  };
  try {
    const result = await answerNawawiExcerpt("اشرح الحديث الأول", 1);
    assert.match(result, /محمد بن صالح العثيمين/);
    assert.match(result, /عبد المحسن العباد/);
    assert.ok(result.startsWith(EXCERPT_NOTICE));
    assert.equal(urls.length, 6);
    assert.equal(result.split(`«${paragraph}»`).length - 1, 2);
    assert.doesNotMatch(result.replace(/https:\/\/\S+/g, ""), /[A-Za-z]/);
  } finally {
    globalThis.fetch = original;
  }
});

it("fails explicitly on source errors or invalid numbers, never falling back to a model", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  try {
    await assert.rejects(answerNawawiExcerpt("الحديث الثاني", 2), ScholarlyExcerptUnavailableError);
    await assert.rejects(answerNawawiExcerpt("الحديث 99", 99), ScholarlyExcerptUnavailableError);
  } finally {
    globalThis.fetch = original;
  }
});