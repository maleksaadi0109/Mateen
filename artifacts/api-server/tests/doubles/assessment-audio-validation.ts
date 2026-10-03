import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  assessmentAnswersTable,
  assessmentAudioCleanupOutboxTable,
  db,
} from "@workspace/db";
import { assessmentAudioTestState } from "./assessment-audio-state";

export function createFrozenAssessmentStoragePath(
  uploadStoragePath: string,
): string {
  const uploadEntityPath = uploadStoragePath.slice("/objects/".length);
  const uploadMarkerIndex = uploadEntityPath.lastIndexOf("uploads/");
  if (!uploadStoragePath.startsWith("/objects/") || uploadMarkerIndex < 0) {
    throw new Error("Invalid test upload path.");
  }
  return `/objects/${uploadEntityPath.slice(0, uploadMarkerIndex)}assessment-audio/frozen/${randomUUID()}`;
}

export async function validateAssessmentAudio(
  uploadStoragePath: string,
  expectedSizeBytes: number,
  _expectedContentType: string,
  frozenStoragePath: string,
  claimWriteLease: () => Promise<void>,
  signal?: AbortSignal,
): Promise<{ durationSeconds: number; actualSizeBytes: number; frozenStoragePath: string }> {
  assessmentAudioTestState.validationCalls += 1;
  if (signal?.aborted) throw new Error("Validation was cancelled.");
  const [answer] = await db.select().from(assessmentAnswersTable)
    .where(and(
      eq(assessmentAnswersTable.uploadStoragePath, uploadStoragePath),
      eq(assessmentAnswersTable.frozenReservationPath, frozenStoragePath),
    ))
    .limit(1);
  assert.ok(answer, "the reservation row must be committed before a frozen object is written");
  const uploaded = assessmentAudioTestState.uploadObjects.get(uploadStoragePath);
  if (!uploaded) throw new Error("The signed test upload has no uploaded bytes.");
  await claimWriteLease();
  const [outboxReservation] = await db.select().from(assessmentAudioCleanupOutboxTable)
    .where(and(
      eq(assessmentAudioCleanupOutboxTable.objectPath, frozenStoragePath),
      eq(assessmentAudioCleanupOutboxTable.state, "writing"),
    ))
    .limit(1);
  assert.ok(outboxReservation, "the independent cleanup outbox must hold the write lease before writer invocation");
  assessmentAudioTestState.writerInvocationPaths.push(frozenStoragePath);
  assessmentAudioTestState.frozenObjects.set(frozenStoragePath, Buffer.from(uploaded));
  if (assessmentAudioTestState.failValidationAfterWrite) {
    assessmentAudioTestState.failValidationAfterWrite = false;
    throw new Error("Simulated process failure after durable frozen-key reservation and write.");
  }
  return {
    durationSeconds: 1,
    actualSizeBytes: expectedSizeBytes,
    frozenStoragePath,
  };
}