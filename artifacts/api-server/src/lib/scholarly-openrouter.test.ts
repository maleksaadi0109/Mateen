import assert from "node:assert/strict";
import { it } from "node:test";
import {
  classifyHadithQuestion, generateStudyAnswer, isScholarlyProviderConfigured,
  OPENROUTER_SCHOLARLY_MODEL, ScholarlyProviderUnavailableError,
} from "./scholarly";

it("routes scope and Arabic answers to OpenRouter with enforced JSON schemas", async () => {
  const fetchBefore = globalThis.fetch;
  const keyBefore = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "synthetic-openrouter-key";
  try {
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
      assert.equal((options?.headers as Record<string, string>).authorization, "Bearer synthetic-openrouter-key");
      const body = JSON.parse(String(options?.body));
      assert.equal(body.model, OPENROUTER_SCHOLARLY_MODEL);
      assert.equal(body.response_format.type, "json_schema");
      assert.equal(body.response_format.json_schema.strict, true);
      assert.equal(body.provider.require_parameters, true);
      assert.equal(body.reasoning.enabled, false);
      assert.equal(body.max_completion_tokens, undefined);
      const value = calls++ === 0
        ? { scope: "hadith" }
        : { answer: "النية هي قصد القلب للعمل.", needsTeacher: false, outOfScope: false };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
    };
    assert.equal(isScholarlyProviderConfigured(OPENROUTER_SCHOLARLY_MODEL), true);
    assert.equal(await classifyHadithQuestion("ما معنى النية؟", OPENROUTER_SCHOLARLY_MODEL), "hadith");
    assert.match((await generateStudyAnswer("ما معنى النية؟", null, OPENROUTER_SCHOLARLY_MODEL))!, /النية هي قصد القلب/);
    assert.equal(calls, 2);
    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        answer: "الكُـنية هي اسم يبدأ بأب أو أم.", needsTeacher: false, outOfScope: false,
      }) } }],
    }));
    assert.match((await generateStudyAnswer("ما الكنية؟", null, OPENROUTER_SCHOLARLY_MODEL))!, /الكُـنية/);
    let repairs = 0;
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      const input = JSON.parse(body.messages[1].content);
      if (repairs > 0) assert.equal(input.previousRejectedDraft, "الكنية هي kunya.");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        answer: repairs++ === 0 ? "الكنية هي kunya." : "الكنية اسم يبدأ بأب أو أم.",
        needsTeacher: false, outOfScope: false,
      }) } }] }));
    };
    assert.match((await generateStudyAnswer("ما الكنية؟", null, OPENROUTER_SCHOLARLY_MODEL))!, /الكنية اسم يبدأ/);
    assert.equal(repairs, 2);
    globalThis.fetch = async () => new Response("{}", { status: 402 });
    await assert.rejects(generateStudyAnswer("ما النية؟", null, OPENROUTER_SCHOLARLY_MODEL),
      /HTTP 402/);
    delete process.env.OPENROUTER_API_KEY;
    assert.equal(isScholarlyProviderConfigured(OPENROUTER_SCHOLARLY_MODEL), false);
    await assert.rejects(generateStudyAnswer("ما النية؟", null, OPENROUTER_SCHOLARLY_MODEL),
      ScholarlyProviderUnavailableError);
  } finally {
    globalThis.fetch = fetchBefore;
    if (keyBefore === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = keyBefore;
  }
});
