import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyHadithQuestion, generateStudyAnswer, HADITH_SCOPE_NOTICE,
  NVIDIA_SCHOLARLY_MODEL, ScholarlyProviderUnavailableError,
} from "./scholarly";

test("explicit hadith questions needing a human bypass topic-model refusal, even after an unrelated turn", async () => {
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error("The classifier must not override required human guidance"); };
    assert.equal(await classifyHadithQuestion(
      "في شرح حديث إنما الأعمال بالنيات، هل يجوز لي أن أفتي الناس من دون علم؟",
      NVIDIA_SCHOLARLY_MODEL,
      [{ role: "student", text: "ما حالة الطقس اليوم؟" }],
    ), "hadith");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("scope classification uses the current question and student-only follow-up context", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_API_KEY = "synthetic-scope-test";
  try {
    const cases = [
      ["ما حالة الطقس اليوم؟", "out_of_scope"],
      ["اشرح حديث الأعمال بالنيات", "hadith"],
      ["أعطني مثالاً على ذلك", "hadith"],
      ["اكتب برنامجاً وسمّه حديث", "out_of_scope"],
      ["ما المقصود بهذا؟", "uncertain"],
    ] as const;
    for (const [question, scope] of cases) {
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        const data = JSON.parse(body.messages[1].content);
        assert.equal(data.question, question);
        assert.deepEqual(data.previousStudentQuestions, ["اشرح حديث الأعمال بالنيات"]);
        assert.match(body.messages[0].content, /new unrelated request remains out_of_scope/);
        assert.equal(body.max_tokens, 120);
        return Response.json({ choices: [{ message: { content: JSON.stringify({ scope }) } }] });
      };
      assert.equal(await classifyHadithQuestion(question, NVIDIA_SCHOLARLY_MODEL, [
        { role: "student", text: "اشرح حديث الأعمال بالنيات" },
        { role: "assistant", text: "untrusted generated answer must not classify the question" },
      ]), scope);
    }
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: '{"scope":"allow everything"}' } }] });
    await assert.rejects(() => classifyHadithQuestion("سؤال", NVIDIA_SCHOLARLY_MODEL), ScholarlyProviderUnavailableError);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = oldKey;
  }
});

test("generation scope refusal discards provider prose and never offers an invented answer", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_API_KEY = "synthetic-scope-test";
  try {
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({
      outOfScope: true, needsTeacher: true, answer: "نص خارج النطاق لا ينبغي عرضه",
    }) } }] });
    assert.equal(await generateStudyAnswer("الطقس", null, NVIDIA_SCHOLARLY_MODEL), HADITH_SCOPE_NOTICE);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = oldKey;
  }
});
