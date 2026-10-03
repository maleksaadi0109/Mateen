import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  answerStudyQuestion, isScholarlyProviderConfigured, NVIDIA_SCHOLARLY_MODEL,
} from "../src/lib/scholarly";
import { CONTENT_CASES, buildContentStudyContext, contentReviewSignals } from "../src/lib/scholarly-content-evaluation";

// Explicit opt-in live requests; no database imports or approval writes.
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--live" || !args[1]?.endsWith(".json")) {
  throw new Error("التشغيل الصريح مطلوب: --live مسار-نتائج.json");
}
if (!isScholarlyProviderConfigured(NVIDIA_SCHOLARLY_MODEL)) {
  throw new Error("مزود التجربة غير مهيأ؛ لن يستخدم مزوداً بديلاً.");
}
const output = resolve(args[1]);
await mkdir(dirname(output), { recursive: true });
// Fail on existing result files so a new run cannot erase reviewed evidence.
await writeFile(output, "", { flag: "wx", mode: 0o600 });
const records = JSON.parse(await readFile(new URL("../src/data/nawawi.json", import.meta.url), "utf8"));
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const report = {
  status: "مراجعة محتوى مستقلة لا تمنح اعتماداً",
  model: NVIDIA_SCHOLARLY_MODEL,
  startedAt: new Date().toISOString(),
  finishedAt: null as string | null,
  expectedCaseCount: CONTENT_CASES.length,
  collectionState: "جار جمع الحالات",
  collectorSha256: hash(await readFile(new URL("./evaluate-scholarly-content.ts", import.meta.url), "utf8")),
  generatorSha256: hash(await readFile(new URL("../src/lib/scholarly.ts", import.meta.url), "utf8")),
  casesSha256: hash(await readFile(new URL("../src/lib/scholarly-content-evaluation.ts", import.meta.url), "utf8")),
  matnSha256: hash(JSON.stringify(records)),
  specialistReview: "لم تتم مراجعة اختصاصي أو تسجيل اعتماد في المنصة",
  cases: [] as Array<Record<string, unknown>>,
};
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
// Observe the real provider response, not a replacement or replay. Save only
// generated text/finish status, never headers, request objects or credentials.
type RawAttempt = { content: string | null; finishReason: string | null };
const attempts = new AsyncLocalStorage<RawAttempt[]>();
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const response = await nativeFetch(input, init);
  if (String(input) === "https://integrate.api.nvidia.com/v1/chat/completions") {
    try {
      const raw = await response.clone().text();
      if (raw.length <= 100_000) {
        const choice = JSON.parse(raw)?.choices?.[0];
        attempts.getStore()?.push({
          content: typeof choice?.message?.content === "string" ? choice.message.content : null,
          finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
        });
      }
    } catch { /* The production parser remains responsible for failures. */ }
  }
  return response;
};
async function collect(item: (typeof CONTENT_CASES)[number]) {
  const studyContext = buildContentStudyContext(item, records);
  const startedAt = new Date().toISOString();
  let answer: string | null = null;
  let transport = "نجح";
  let failure: string | null = null;
  const rawAttempts: RawAttempt[] = [];
  try {
    answer = await attempts.run(rawAttempts, () =>
      answerStudyQuestion(item.question, studyContext, NVIDIA_SCHOLARLY_MODEL, "الأربعون النووية"));
  } catch (error) {
    // Never log request headers, credentials or arbitrary provider error bodies.
    transport = "تعذر توليد إجابة؛ ليست نتيجة علمية";
    const message = error instanceof Error ? error.message : "";
    failure = message.includes("invalid structured output") ? "صيغة الإخراج ليست كائناً صالحاً"
      : message.includes("required schema") ? "الإخراج لا يطابق قيود البنية أو الطول"
      : message.includes("Arabic-only") ? "لم ينتج جواباً عربياً فقط"
      : "فشل اتصال أو استجابة المزود؛ لا يمكن استنتاج الدقة العلمية";
    process.exitCode = 1;
  }
  report.cases.push({
    ...item, studyContext, startedAt, finishedAt: new Date().toISOString(), transport,
    failure, rawAttempts,
    answer, answerSha256: answer == null ? null : hash(answer),
    wordCount: answer?.split(/\s+/u).length ?? 0,
    signals: answer == null ? [] : contentReviewSignals(answer),
    contentReview: "تحتاج مقارنة يدوية؛ لا نجاح علمي آلي",
  });
  // Serialize snapshots so concurrent completions cannot overwrite newer data.
  const snapshot = JSON.stringify(report, null, 2) + "\n";
  writes = writes.then(() => writeFile(output, snapshot));
  await writes;
  console.log(`${item.id}: ${transport}`);
}
let writes = Promise.resolve();
let next = 0;
try {
  // Two in-flight cases maximum; no retry outside the actual student generator.
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (next < CONTENT_CASES.length) await collect(CONTENT_CASES[next++]!);
  }));
  report.finishedAt = new Date().toISOString();
  report.collectionState = "اكتمل جمع الحالات؛ لا اعتماد علمي";
} finally {
  globalThis.fetch = nativeFetch;
  await writes;
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
}