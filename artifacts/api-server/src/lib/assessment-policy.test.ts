import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVE_SECONDS,
  AUDIO_MAX_BYTES,
  AUDIO_MAX_DURATION_SECONDS,
  buildQuestions,
  canonicalHash,
  canonicalPassages,
  compareWords,
  normalizeAssessmentText,
  policySnapshot,
  passageIdentityKey,
  scoreExact,
  selectedCanonicalHash,
  sourceVersion,
} from "./assessment-policy";
import {
  answerSequenceDisposition,
  advanceTrustedActiveClock,
  failedRetryAvailableAt,
  nextReviewIntervalDays,
  projectAttempt,
  remainingSeconds,
  reviewerCanReviewAttempt,
  reviewerGrantIsEnabled,
  staleHeartbeat,
} from "./assessment-service";
import { SingleWorkerQueue } from "./recitation-queue";
import type { AssessmentAttemptRecord } from "@workspace/db";

test("assessment policy is fixed, uses bounded real source text, and never exposes future levels", () => {
  assert.deepEqual(
    [
      policySnapshot.questions,
      policySnapshot.writtenQuestions,
      policySnapshot.oralQuestions,
      policySnapshot.activeMinutes,
      policySnapshot.passScore,
      policySnapshot.retryHours,
      policySnapshot.audioRetentionDays,
      policySnapshot.gradingMode,
    ],
    [30, 15, 15, 30, 25, 24, 30, "human_adjudicated_oral"],
  );
  assert.equal("nextLevel" in policySnapshot, false);
  assert.match(canonicalHash, /^[a-f0-9]{64}$/u);
  assert.equal(sourceVersion, `nawawi-${canonicalHash.slice(0, 16)}`);
  assert.equal(canonicalPassages.length, 42);
  assert.ok(canonicalPassages.every((record) => record.text.length > 0));
});

test("question pool is 30 distinct, immutable source-bound windows with selection metadata", () => {
  const questions = buildQuestions(() => 0);
  assert.equal(questions.length, 30);
  assert.equal(questions.filter((question) => question.kind === "written").length, 15);
  assert.equal(questions.filter((question) => question.kind === "oral").length, 15);
  const keys = questions.map((question) => `${question.hadithNumber}:${question.sourceSelection.windowStartWord}`);
  assert.equal(new Set(keys).size, 30);
  for (const question of questions) {
    assert.equal(question.referenceText.split(/\s+/u).length, 8);
    assert.equal(question.prompt.split(/\s+/u).slice(0, 8).length, 8);
    assert.equal(question.sourceSelection.cueWords, 8);
    assert.equal(question.sourceSelection.targetWords, 8);
    assert.equal(question.prompt.endsWith("أكمل الكلمات الثماني التالية فقط"), true);
    const passage = canonicalPassages.find((item) => item.number === question.hadithNumber)!;
    const words = passage.text.trim().split(/\s+/u);
    const offset = question.sourceSelection.windowStartWord;
    assert.equal(words.slice(offset, offset + 8).join(" "), question.prompt.split(" …")[0]);
    assert.equal(words.slice(offset + 8, offset + 16).join(" "), question.referenceText);
    assert.ok(!question.prompt.includes("رواه مسلم"));
  }
  assert.equal(selectedCanonicalHash(questions), selectedCanonicalHash(questions));
  assert.notEqual(selectedCanonicalHash(questions), selectedCanonicalHash(questions.slice(1)));
});

test("exact matching ignores tashkeel, tatweel, punctuation, and whitespace but preserves Arabic letter identity", () => {
  assert.equal(normalizeAssessmentText("إِنَّمَا ـ الأَعْمَالُ، بِالنِّيَّاتِ"), normalizeAssessmentText("إنما الأعمال بالنيات"));
  assert.equal(scoreExact("عن أبي هريرة رضي الله عنه", "عن أبي هريرة، رضي الله عنه"), 1);
  assert.equal(scoreExact("الذين آمنوا", "الذين علموا"), 0);
  assert.equal(scoreExact("إنما", "إن ما"), 0, "spaces preserve Arabic word boundaries");
  assert.equal(scoreExact("لايحب", "لا يحب"), 0, "joining separate words is not a semantic match");
  assert.equal(scoreExact("أمر", "امر"), 0, "hamza distinction is meaningful");
  const differences = compareWords("قال رسول الله", "قال النبي الله");
  assert.equal(differences.some((item) => item.kind === "substitution"), true);
  assert.equal(compareWords("قال رسول الله", "").length, 3);
});

test("unanswered timing is zero-score policy and server checkpoints bound active time", () => {
  const now = Date.now();
  const attempt = {
    id: "attempt-id",
    userId: "owner",
    status: "in_progress",
    textId: "nawawi",
    sourceVersion,
    canonicalHash,
    policySnapshot,
    questionsSnapshot: [],
    sessionId: "lease-secret",
    activeSeconds: 1770,
    activeMilliseconds: 250,
    currentQuestionPosition: 3,
    lastHeartbeatAt: new Date(now - 5_000),
    lastTrustedAt: new Date(now - 5_000),
    submittedAt: null,
    retryAvailableAt: null,
    result: null,
    submitMutationId: null,
    createdAt: new Date(now - 10_000),
    updatedAt: new Date(now - 5_000),
  } as unknown as AssessmentAttemptRecord;
  assert.equal(remainingSeconds(attempt), 30);
  assert.equal(staleHeartbeat(attempt, now), false);
  assert.equal(staleHeartbeat(attempt, now + 21_000), true);
  const visible = projectAttempt(attempt, [], "lease-secret", now) as Record<string, unknown>;
  assert.equal("sessionId" in visible, false, "lease credentials never project to clients");
  const hidden = projectAttempt(attempt, [], "different-tab", now) as { questions: unknown[] };
  assert.deepEqual(hidden.questions, [], "lost lease hides in-progress questions");
  const atTimeout = { ...attempt, activeSeconds: ACTIVE_SECONDS, activeMilliseconds: 0 };
  assert.equal(remainingSeconds(atTimeout), 0);
  assert.equal(AUDIO_MAX_BYTES, 10 * 1024 * 1024);
  assert.equal(AUDIO_MAX_DURATION_SECONDS, 60);
});

test("trusted active clock carries fractional milliseconds across rapid heartbeat checkpoints", () => {
  let clock = {
    activeSeconds: 0,
    activeMilliseconds: 0,
    lastHeartbeatAt: new Date(0),
  };
  let next = { activeSeconds: 0, activeMilliseconds: 0, atLimit: false };
  for (let index = 1; index <= ACTIVE_SECONDS * 10; index += 1) {
    const now = index * 100;
    next = advanceTrustedActiveClock(clock, now);
    clock = { ...next, lastHeartbeatAt: new Date(now) };
  }
  assert.equal(next.activeSeconds, ACTIVE_SECONDS);
  assert.equal(next.activeMilliseconds, 0);
  assert.equal(next.atLimit, true);
});

test("answer sequence acknowledgements are idempotent and conflicting retries are fenced", () => {
  const saved = {
    savedSequence: 2,
    savedMutationId: "mutation-2",
    savedAnswer: "saved text",
  };
  assert.equal(answerSequenceDisposition({
    ...saved,
    requestedSequence: 2,
    requestedMutationId: "mutation-2",
    requestedAnswer: "saved text",
  }), "replay");
  assert.equal(answerSequenceDisposition({
    ...saved,
    requestedSequence: 2,
    requestedMutationId: "mutation-2",
    requestedAnswer: "edited text",
  }), "conflict");
  assert.equal(answerSequenceDisposition({
    ...saved,
    requestedSequence: 3,
    requestedMutationId: "mutation-3",
    requestedAnswer: "next text",
  }), "next");
  assert.equal(answerSequenceDisposition({
    ...saved,
    requestedSequence: 4,
    requestedMutationId: "skipped",
    requestedAnswer: "next text",
  }), "conflict");
});

test("only DB-enabled reviewer grants authorize and scheduled intervals are verified-only", () => {
  assert.equal(reviewerGrantIsEnabled(true), true);
  assert.equal(reviewerCanReviewAttempt("reviewer", "student"), true);
  assert.equal(reviewerCanReviewAttempt("reviewer", "reviewer"), false);
  for (const untrusted of [false, undefined, null, "true", 1]) {
    assert.equal(reviewerGrantIsEnabled(untrusted), false);
  }
  assert.equal(nextReviewIntervalDays(1, true), 3);
  assert.equal(nextReviewIntervalDays(3, true), 7);
  assert.equal(nextReviewIntervalDays(7, true), 14);
  assert.equal(nextReviewIntervalDays(14, true), 30);
  assert.equal(nextReviewIntervalDays(30, true), 30);
  assert.equal(nextReviewIntervalDays(30, false), 1);
});

test("failed retake cooldown anchors to server submission time, not delayed human review", () => {
  const submittedAt = new Date("2026-01-01T12:00:00.000Z");
  const humanReviewCompletedAt = new Date("2026-01-04T12:00:00.000Z");
  assert.equal(
    failedRetryAvailableAt(submittedAt, humanReviewCompletedAt).toISOString(),
    "2026-01-02T12:00:00.000Z",
  );
});

test("scheduled mistake reviews are passage-scoped and repeated misses reset only that passage", () => {
  const passage = canonicalPassages.find((item) => item.text.trim().split(/\s+/u).length >= 32)!;
  const words = passage.text.trim().split(/\s+/u);
  const firstReference = words.slice(8, 16).join(" ");
  const secondReference = words.slice(24, 32).join(" ");
  const firstKey = passageIdentityKey(sourceVersion, passage.number, 0, firstReference);
  const secondKey = passageIdentityKey(sourceVersion, passage.number, 16, secondReference);
  const repeatedFirstKey = passageIdentityKey(sourceVersion, passage.number, 0, firstReference);
  assert.notEqual(firstKey, secondKey, "different windows of one hadith keep separate review identities");
  assert.equal(firstKey, repeatedFirstKey, "the same canonical window deduplicates across assessment attempts");

  const reviews = new Map([
    [firstKey, { intervalDays: 3, sourceQuestionId: "first-source", sourceVersion }],
    [secondKey, { intervalDays: 1, sourceQuestionId: "second-source", sourceVersion }],
  ]);
  const existingFirst = reviews.get(repeatedFirstKey)!;
  reviews.set(repeatedFirstKey, {
    ...existingFirst,
    intervalDays: 1,
  });
  assert.equal(reviews.size, 2);
  assert.equal(reviews.get(firstKey)?.intervalDays, 1, "a repeated miss resets only its matching passage to stage one");
  assert.equal(reviews.get(firstKey)?.sourceQuestionId, "first-source", "deduplication preserves the original source association");
  reviews.set(secondKey, {
    ...reviews.get(secondKey)!,
    intervalDays: nextReviewIntervalDays(reviews.get(secondKey)!.intervalDays, true),
  });
  assert.equal(reviews.get(secondKey)?.intervalDays, 3, "a correct response advances only the reviewed passage");
  assert.equal(reviews.get(firstKey)?.intervalDays, 1, "another passage remains at its own stage");
});

test("assessment audio validation admission stays bounded under concurrent uploads", async () => {
  const queue = new SingleWorkerQueue(3);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const work = async () => { await gate; };
  assert.equal(queue.enqueue("one", work), true);
  assert.equal(queue.enqueue("two", work), true);
  assert.equal(queue.enqueue("three", work), true);
  assert.equal(queue.enqueue("overflow", work), false);
  assert.equal(queue.size, 3);
  assert.equal(queue.canAccept("two"), true);
  release();
  await new Promise<void>((resolve) => {
    const wait = () => queue.size === 0 ? resolve() : setTimeout(wait, 1);
    wait();
  });
  assert.equal(queue.size, 0);
});