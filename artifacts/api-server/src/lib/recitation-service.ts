import { and, eq } from "drizzle-orm";
import { AnalyzeRecitationPracticeResponse } from "@workspace/api-zod";
import {
  db,
  practiceRecitationsTable,
} from "@workspace/db";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "./objectStorage";
import { toPracticeRecitation } from "./recitation-contract";
import { canonicalMatnRecords } from "./canonical-matn";
import { assertPracticeOnlyResult } from "./recitation-safety";

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const RETENTION_MS = 24 * 60 * 60 * 1000;
export const UPLOAD_URL_TTL_MS = 15 * 60 * 1000;
export const MAX_PER_STUDENT_ACTIVE = 2;
export const MAX_CONCURRENT_QUEUE = 3;

const storage = new ObjectStorageService();
export const referenceByNumber = new Map(
  canonicalMatnRecords.map((record) => [record.number, record.text]),
);

const canonicalMimeTypes = new Map([
  ["audio/webm", "audio/webm"],
  ["audio/webm;codecs=opus", "audio/webm"],
  ["audio/ogg", "audio/ogg"],
  ["audio/ogg;codecs=opus", "audio/ogg"],
  ["audio/ogg;codecs=vorbis", "audio/ogg"],
  ["audio/mp4", "audio/mp4"],
  ["audio/mp4;codecs=mp4a.40.2", "audio/mp4"],
  ["audio/mpeg", "audio/mpeg"],
  ["audio/mpeg;codecs=mp3", "audio/mpeg"],
]);

export function canonicalizeContentType(value: string): string | null {
  const normalized = value.trim().toLowerCase().replace(/\s*;\s*/g, ";");
  return canonicalMimeTypes.get(normalized) ?? null;
}

function hasKeys(value: unknown, expected: string[]): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    expected.every((key) => key in value)
  );
}

function exactKeys(value: unknown, expected: string[]): value is Record<string, unknown> {
  return (
    hasKeys(value, expected) &&
    Object.keys(value).length === expected.length &&
    Object.keys(value).every((key) => expected.includes(key))
  );
}

export function normalizeRuntimeResult(value: unknown) {
  const resultKeys = [
    "transcript",
    "referenceText",
    "model",
    "modelRevision",
    "provisional",
    "assessment",
    "alignment",
  ];
  if (!exactKeys(value, resultKeys)) {
    throw new Error("Local analysis result did not match the required contract.");
  }
  assertPracticeOnlyResult(value);
  const alignment = value.alignment;
  const alignmentKeys = [
    "spans",
    "approvedForAssessment",
    "studentScore",
    "wordErrorRate",
  ];
  if (!hasKeys(alignment, alignmentKeys) || !Array.isArray(alignment.spans)) {
    throw new Error("Local analysis result did not match the required contract.");
  }
  const spans = alignment.spans.map((span) => {
    const required = [
      "kind",
      "operation",
      "referenceWords",
      "recognizedWords",
      "humanReviewRequired",
      "confirmedLearnerError",
    ];
    if (
      !hasKeys(span, required) ||
      !Array.isArray(span.referenceWords) ||
      !Array.isArray(span.recognizedWords)
    ) {
      throw new Error("Local analysis result did not match the required contract.");
    }
    return {
      kind: span.kind,
      operation: span.operation,
      referenceWords: span.referenceWords,
      recognizedWords: span.recognizedWords,
      humanReviewRequired: span.humanReviewRequired,
      confirmedLearnerError: span.confirmedLearnerError,
    };
  });
  const sanitized = {
    transcript: value.transcript,
    referenceText: value.referenceText,
    model: value.model,
    modelRevision: value.modelRevision,
    provisional: value.provisional,
    assessment: value.assessment,
    alignment: {
      spans,
      approvedForAssessment: alignment.approvedForAssessment,
      studentScore: alignment.studentScore,
      wordErrorRate: alignment.wordErrorRate,
    },
  };
  const parsed = AnalyzeRecitationPracticeResponse.shape.result.parse(sanitized);
  if (!parsed) {
    throw new Error("Local analysis returned an empty result.");
  }
  return parsed;
}

export function responseRecord(row: typeof practiceRecitationsTable.$inferSelect) {
  return toPracticeRecitation(row);
}

export async function getOwnedRecitation(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(practiceRecitationsTable)
    .where(
      and(
        eq(practiceRecitationsTable.id, id),
        eq(practiceRecitationsTable.userId, userId),
      ),
    )
    .limit(1);
  return row;
}

export function getStorageFile(storagePath: string) {
  return storage.getObjectEntityFile(storagePath);
}

export async function removeRemoteAudio(storagePath: string | null): Promise<void> {
  if (!storagePath) return;
  try {
    const file = await getStorageFile(storagePath);
    await file.delete({ ignoreNotFound: true });
  } catch (error) {
    if (error instanceof ObjectNotFoundError) return;
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === 404 || error.code === "404")
    ) {
      return;
    }
    throw error;
  }
}