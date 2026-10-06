import assert from "node:assert/strict";
import { test } from "node:test";
import {
  answerFromPassages, semanticRank, lexicalRank, corpusDigest,
  NVIDIA_SCHOLARLY_MODEL, ScholarlyProviderUnavailableError, type PassageCandidate,
} from "./scholarly";

const evidence: PassageCandidate = {
  id: "9bc4c8bd-b859-47c3-9df4-84fb7d132baa",
  sourceId: "2be985b5-8e60-44dd-abf1-c1a7eaa57db1",
  text: "النية في العمل نص اصطناعي للاختبار فقط.",
  title: "مادة اصطناعية", author: "اختبار", edition: "اختبار", version: "fixture",
  textId: "nawawi", volume: null, printedPage: null, pdfPage: null,
};
const envelope = (value: unknown) => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(value) } }],
}));

test("RAG real retrieval/rerank/generation functions use NVIDIA transport and the same deadline; only supplied evidence survives", async () => {
  const original = globalThis.fetch;
  const saved = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_API_KEY = "synthetic-fixture-key";
  const deadline = new AbortController();
  let calls = 0;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://integrate.api.nvidia.com/v1/chat/completions");
      const body = JSON.parse(String(options?.body));
      assert.equal(body.model, NVIDIA_SCHOLARLY_MODEL);
      const input = JSON.parse(body.messages[1].content);
      calls++;
      assert.equal(input.question, "ما النية في العمل؟");
      assert.deepEqual(input.passages, [{ id: evidence.id, text: evidence.text }]);
      assert.ok(options?.signal);
      deadline.signal.addEventListener("abort", () => assert.equal(options?.signal?.aborted, true));
      if (calls === 1) return envelope({ passageIds: [evidence.id] });
      return envelope({ abstain: false, answer: "ادعاء حر لا دليل عليه", reason: "ادعاء آخر",
        citations: [{ passageId: evidence.id, quote: "النية في العمل" }] });
    };
    const lexical = lexicalRank("ما النية في العمل؟", [
      evidence, { ...evidence, id: "99534e5b-715f-43b2-966b-dc75a8c9c907", text: "الهاتف الشخصي" },
    ]);
    assert.deepEqual(lexical, [evidence]);
    const ranked = await semanticRank("ما النية في العمل؟", lexical, NVIDIA_SCHOLARLY_MODEL, deadline.signal);
    const answer = await answerFromPassages("ما النية في العمل؟", null, ranked, NVIDIA_SCHOLARLY_MODEL, deadline.signal);
    assert.equal(answer.answer, "«النية في العمل»");
    assert.equal(answer.reason, "");
    assert.equal(calls, 2);
    deadline.abort();
    await assert.rejects(answerFromPassages("النية", null, ranked, NVIDIA_SCHOLARLY_MODEL, deadline.signal), ScholarlyProviderUnavailableError);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
    if (saved === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = saved;
  }
});

test("RAG rejects quotes beyond truncated evidence, excluded passage IDs, blank quotes and rerank IDs never sent", async () => {
  const original = globalThis.fetch;
  const saved = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_API_KEY = "synthetic-fixture-key";
  try {
    const hidden = { ...evidence, id: "99534e5b-715f-43b2-966b-dc75a8c9c907" };
    const long = { ...evidence, text: "ا".repeat(4000) + "ذيل لم يرسل للنموذج" };
    for (const [passages, citation] of [
      [[long], { passageId: long.id, quote: "ذيل لم يرسل للنموذج" }],
      [[...Array(8).fill(evidence), hidden], { passageId: hidden.id, quote: hidden.text }],
      [[evidence], { passageId: evidence.id, quote: " " }],
    ] as Array<[PassageCandidate[], { passageId: string; quote: string }]>) {
      globalThis.fetch = async () => envelope({ abstain: false, answer: "حذف", reason: "", citations: [citation] });
      await assert.rejects(answerFromPassages("النية", null, passages, NVIDIA_SCHOLARLY_MODEL), ScholarlyProviderUnavailableError);
    }
    globalThis.fetch = async () => envelope({ passageIds: [hidden.id] });
    await assert.rejects(semanticRank("النية", [...Array(30).fill(evidence), hidden], NVIDIA_SCHOLARLY_MODEL), ScholarlyProviderUnavailableError);
    globalThis.fetch = async () => envelope({ passageIds: [evidence.id, evidence.id] });
    await assert.rejects(semanticRank("النية", [evidence], NVIDIA_SCHOLARLY_MODEL), ScholarlyProviderUnavailableError);
  } finally {
    globalThis.fetch = original;
    if (saved === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = saved;
  }
});

test("RAG lexical zero matches and stopwords are not evidence; book scope changes invalidate evaluation", () => {
  assert.deepEqual(lexicalRank("ما هو هذا في من عن", [evidence]), []);
  assert.deepEqual(lexicalRank("الهاتف الشخصي للمؤلف", [evidence]), []);
  assert.notEqual(corpusDigest([evidence]), corpusDigest([{ ...evidence, textId: "tuhfa" }]));
});
