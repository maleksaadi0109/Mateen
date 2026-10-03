import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AnalyzeRecitationPracticeResponse,
  RequestRecitationPracticeBody,
} from "@workspace/api-zod";
import { SingleWorkerQueue } from "./recitation-queue";
import { toPracticeRecitation } from "./recitation-contract";

test("generated request schema accepts supported codec-specific MIME types", () => {
  for (const contentType of [
    "audio/webm",
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/ogg;codecs=vorbis",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mpeg;codecs=mp3",
  ]) {
    assert.equal(
      RequestRecitationPracticeBody.safeParse({
        textId: "nawawi",
        hadithNumber: 1,
        contentType,
        sizeBytes: 1,
        consent: true,
      }).success,
      true,
      contentType,
    );
  }
});

test("generated request schema rejects invalid MIME and over-limit audio", () => {
  const base = {
    textId: "nawawi",
    hadithNumber: 1,
    contentType: "audio/webm;codecs=opus",
    sizeBytes: 1,
    consent: true,
  };
  assert.equal(
    RequestRecitationPracticeBody.safeParse({
      ...base,
      contentType: "audio/wav",
    }).success,
    false,
  );
  assert.equal(
    RequestRecitationPracticeBody.safeParse({
      ...base,
      sizeBytes: 10 * 1024 * 1024 + 1,
    }).success,
    false,
  );
});

test("generated result schema accepts a single alignment span over 100 words", () => {
  const words = Array.from({ length: 101 }, (_, index) => `w${index}`);
  assert.equal(
    AnalyzeRecitationPracticeResponse.safeParse({
      id: "c2f61ab7-40c6-4d6d-a0b2-2b457eb181b8",
      textId: "nawawi",
      hadithNumber: 1,
      status: "completed",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-02T00:00:00.000Z",
      error: null,
      audioDeleted: true,
      result: {
        transcript: words.join(" "),
        referenceText: words.join(" "),
        model: "Qwen/Qwen3-ASR-0.6B-hf",
        modelRevision: "0123456789abcdef0123456789abcdef01234567",
        provisional: true,
        assessment: false,
        alignment: {
          spans: [
            {
              kind: "recognized_word_match_not_assessment",
              operation: "equal",
              referenceWords: words,
              recognizedWords: words,
              humanReviewRequired: false,
              confirmedLearnerError: false,
            },
          ],
          approvedForAssessment: false,
          studentScore: null,
          wordErrorRate: null,
        },
      },
    }).success,
    true,
  );
});

test("public practice projection exposes neither owner nor storage key", () => {
  const privateRecord = {
    id: "c2f61ab7-40c6-4d6d-a0b2-2b457eb181b8",
    userId: "clerk-owner-secret",
    textId: "nawawi",
    hadithNumber: 1,
    status: "deleted",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    expiresAt: new Date("2026-01-02T00:00:00.000Z"),
    error: "should be cleared",
    result: { transcript: "should be cleared" },
    audioDeleted: true,
    storagePath: "/objects/private/audio",
    expectedContentType: "audio/webm",
  };
  const projected = toPracticeRecitation(privateRecord);
  assert.deepEqual(Object.keys(projected).sort(), [
    "audioDeleted",
    "createdAt",
    "error",
    "expiresAt",
    "hadithNumber",
    "id",
    "result",
    "status",
    "textId",
  ]);
  assert.equal(projected.error, null);
  assert.equal(projected.result, null);
});

test("local inference queue stays bounded and runs one job at a time", async () => {
  const queue = new SingleWorkerQueue(2);
  const started: string[] = [];
  let active = 0;
  let maxActive = 0;
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const run = (id: string, gate?: Promise<void>) => async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    started.push(id);
    if (gate) await gate;
    active -= 1;
  };

  assert.equal(queue.enqueue("first", run("first", firstGate)), true);
  assert.equal(queue.enqueue("cancel-me", run("cancel-me")), true);
  assert.equal(queue.size, 2);
  assert.equal(queue.canAccept(), false);
  assert.equal(queue.cancelPending("cancel-me"), true);
  assert.equal(queue.enqueue("third", run("third")), true);
  releaseFirst();
  await new Promise<void>((resolve) => {
    const poll = () => {
      if (queue.size === 0) resolve();
      else setTimeout(poll, 5);
    };
    poll();
  });
  assert.deepEqual(started, ["first", "third"]);
  assert.equal(maxActive, 1);
});