import assert from "node:assert/strict";
import { it } from "node:test";
import {
  answerStudyQuestion,
  generateStudyAnswer,
  generateNvidiaScholarlyPreview,
  isScholarlyProviderConfigured,
  NVIDIA_SCHOLARLY_MODEL,
  semanticRank,
  ScholarlyProviderUnavailableError,
  UNVERIFIED_STUDY_NOTICE,
  type PassageCandidate,
} from "./scholarly";

const passage: PassageCandidate = {
  id: "9bc4c8bd-b859-47c3-9df4-84fb7d132baa",
  sourceId: "2be985b5-8e60-44dd-abf1-c1a7eaa57db1",
  title: "Connection test only",
  author: "Synthetic fixture",
  edition: "Test",
  volume: null,
  printedPage: null,
  pdfPage: null,
  text: "The verification card is brown.",
};

it("generates labelled study answers without accessing administrator previews or source passages", async () => {
  const originalFetch = globalThis.fetch;
  const saved = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_API_KEY = "synthetic-nvidia-test-key";
  try {
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      assert.match(body.messages[0].content, /do not claim verification or invent citations/);
      assert.match(body.messages[0].content, /in-depth but accessible lesson/);
      assert.match(body.messages[0].content, /explain each relevant phrase and how the phrases connect/);
      assert.match(body.messages[0].content, /450 to 650 Arabic words/);
      assert.match(body.messages[0].content, /if the student explicitly requests a shorter explanation/);
      assert.doesNotMatch(body.messages[0].content, /no more than 250 words/);
      assert.equal(body.max_tokens, 4500);
      assert.deepEqual(JSON.parse(body.messages[1].content), {
        question: "ما معنى الحديث الأول؟", studyContext: null,
        selectedBook: "الأربعون النووية",
      });
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ answer: "إجابة اختبار تعليمية فقط." }) } }],
      }));
    };
    const answer = await answerStudyQuestion("ما معنى الحديث الأول؟", null, NVIDIA_SCHOLARLY_MODEL);
    assert.equal(answer, `${UNVERIFIED_STUDY_NOTICE}\n\nإجابة اختبار تعليمية فقط.`);
    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ answer: "   " }) } }],
    }));
    await assert.rejects(answerStudyQuestion("سؤال", null, NVIDIA_SCHOLARLY_MODEL), ScholarlyProviderUnavailableError);
  } finally {
    globalThis.fetch = originalFetch;
    if (saved === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = saved;
  }
});

it("model uncertainty requests a teacher with no generated refusal claims, retaining dialogue context", async () => {
  const originalFetch = globalThis.fetch;
  const saved = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_API_KEY = "synthetic-nvidia-test-key";
  try {
    const conversationHistory = [{ role: "student", text: "اشرح الحديث الأول" }, { role: "assistant", text: "شرح سابق غير مراجع" }];
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      assert.match(body.messages[0].content, /needsTeacher=true and answer=null/);
      assert.deepEqual(JSON.parse(body.messages[1].content).conversationHistory, conversationHistory);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ answer: "رفض غير موثوق", needsTeacher: true }) } }],
      }));
    };
    assert.equal(await generateStudyAnswer("سؤال يحتاج إلى معلم", null, NVIDIA_SCHOLARLY_MODEL, "الأربعون النووية", conversationHistory), null);
  } finally {
    globalThis.fetch = originalFetch;
    if (saved === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = saved;
  }
});

it("removes asterisks and retries mixed-language study answers instead of saving English words", async () => {
  const originalFetch = globalThis.fetch;
  const saved = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_API_KEY = "synthetic-nvidia-test-key";
  try {
    let calls = 0;
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      assert.match(body.messages[0].content, /Never use asterisks/);
      calls++;
      if (calls > 1) assert.match(body.messages[0].content, /previous response contained non-Arabic words/);
      const answer = calls === 1
        ? "**المعنى:** المقاصد أو motives."
        : "**المعنى:** الأعمال بالنيات.\n* مثال: طلب العلم بنية التعلم.";
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ answer }) } }],
      }));
    };
    const answer = await answerStudyQuestion("اشرح الحديث الأول", null, NVIDIA_SCHOLARLY_MODEL);
    assert.equal(calls, 2);
    assert.equal(answer, `${UNVERIFIED_STUDY_NOTICE}\n\nالمعنى: الأعمال بالنيات.\n مثال: طلب العلم بنية التعلم.`);
    assert.doesNotMatch(answer, /[A-Za-z*]/);
    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ answer: "شرح مع motives" }) } }],
    }));
    await assert.rejects(answerStudyQuestion("اشرح", null, NVIDIA_SCHOLARLY_MODEL), ScholarlyProviderUnavailableError);
  } finally {
    globalThis.fetch = originalFetch;
    if (saved === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = saved;
  }
});

it("routes NVIDIA requests to the fixed NVIDIA endpoint with its own key and validates JSON", async () => {
  const originalFetch = globalThis.fetch;
  const saved = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_API_KEY = "synthetic-nvidia-test-key";
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://integrate.api.nvidia.com/v1/chat/completions");
      assert.equal(options?.headers && (options.headers as Record<string, string>).authorization,
        "Bearer synthetic-nvidia-test-key");
      const body = JSON.parse(String(options?.body));
      assert.equal(body.model, NVIDIA_SCHOLARLY_MODEL);
      assert.equal(body.stream, false);
      assert.equal(body.max_tokens, 5000);
      assert.equal(body.reasoning_budget, 0);
      assert.equal(body.max_completion_tokens, undefined);
      assert.match(body.messages[0].content, /JSON object matching this schema/);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ passageIds: [passage.id] }) } }],
      }));
    };
    assert.equal(isScholarlyProviderConfigured(NVIDIA_SCHOLARLY_MODEL), true);
    assert.deepEqual(await semanticRank("What color is the card?", [passage], NVIDIA_SCHOLARLY_MODEL), [passage]);
    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ passageIds: ["not-a-valid-id"] }) } }],
    }));
    await assert.rejects(
      semanticRank("What color is the card?", [passage], NVIDIA_SCHOLARLY_MODEL),
      ScholarlyProviderUnavailableError,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (saved === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = saved;
  }
});

it("does not silently send an NVIDIA model to OpenAI when the NVIDIA key is missing", async () => {
  const saved = process.env.NVIDIA_API_KEY;
  delete process.env.NVIDIA_API_KEY;
  try {
    assert.equal(isScholarlyProviderConfigured(NVIDIA_SCHOLARLY_MODEL), false);
    await assert.rejects(
      semanticRank("What color is the card?", [passage], NVIDIA_SCHOLARLY_MODEL),
      ScholarlyProviderUnavailableError,
    );
    await assert.rejects(generateNvidiaScholarlyPreview("سؤال تجريبي"), ScholarlyProviderUnavailableError);
  } finally {
    if (saved !== undefined) process.env.NVIDIA_API_KEY = saved;
  }
});

it("private previews use NVIDIA without a corpus and keep provider output as untrusted text", async () => {
  const originalFetch = globalThis.fetch;
  const saved = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_API_KEY = "synthetic-nvidia-test-key";
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://integrate.api.nvidia.com/v1/chat/completions");
      const body = JSON.parse(String(options?.body));
      assert.equal(body.model, NVIDIA_SCHOLARLY_MODEL);
      assert.equal(body.messages[1].content, "سؤال تجريبي");
      assert.equal(body.max_tokens, 2000);
      assert.match(body.messages[0].content, /لا توجد مصادر موثقة/);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ answer: "<script>not executable</script>" }) } }],
      }));
    };
    assert.equal(await generateNvidiaScholarlyPreview("  سؤال تجريبي  "), "<script>not executable</script>");
    for (const output of [{ answer: "" }, { answer: "x".repeat(6001) }, { answer: "test", approved: true }]) {
      globalThis.fetch = async () => new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(output) } }],
      }));
      await assert.rejects(generateNvidiaScholarlyPreview("سؤال تجريبي"), ScholarlyProviderUnavailableError);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (saved === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = saved;
  }
});

it("private previews reject invalid questions before making any provider request", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Provider must not be contacted"); };
  try {
    for (const question of ["", "   ", "أ", "x".repeat(2001)]) {
      await assert.rejects(generateNvidiaScholarlyPreview(question), { name: "ZodError" });
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});