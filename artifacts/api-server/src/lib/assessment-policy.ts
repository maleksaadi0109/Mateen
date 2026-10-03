import { createHash, randomUUID } from "node:crypto";
import { canonicalMatnBoundaries, canonicalMatnRecords } from "./canonical-matn";

export const ACTIVE_SECONDS = 30 * 60;
export const RETRY_DELAY_MS = 24 * 60 * 60 * 1000;
export const HEARTBEAT_STALE_MS = 20_000;
export const ANSWER_LEASE_MS = 60_000;
export const AUDIO_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const AUDIO_MAX_BYTES = 10 * 1024 * 1024;
export const AUDIO_MAX_DURATION_SECONDS = 60;
export const AUDIO_UPLOAD_TTL_MS = 15 * 60 * 1000;
export const AUDIO_UPLOAD_EXPIRY_SKEW_MS = 2 * 60 * 1000;
export const AUDIO_FROZEN_RESERVATION_GRACE_MS =
  process.env.NODE_ENV === "test" ? 250 : 3 * 60 * 1000;
export const AUDIO_FROZEN_WRITE_LEASE_MS = 5 * 60 * 1000;
export const AUDIO_FROZEN_WRITE_DEADLINE_MS = 45_000;

export type CanonicalPassage = { number: number; text: string; title: string; sourcePage: number; sourceUrl: string };
export const canonicalPassages: CanonicalPassage[] = canonicalMatnRecords.map((item) => ({
  number: item.number,
  text: item.text,
  title: item.title,
  sourcePage: item.sourcePage,
  sourceUrl: item.sourceUrl,
}));

export const canonicalHash = createHash("sha256")
  .update(JSON.stringify(canonicalPassages))
  .digest("hex");
export const sourceVersion = `nawawi-${canonicalHash.slice(0, 16)}`;

export const policySnapshot = {
  textId: "nawawi",
  level: "التمهيدي",
  questions: 30,
  writtenQuestions: 15,
  oralQuestions: 15,
  activeMinutes: 30,
  pointsPerQuestion: 1,
  passScore: 25,
  retryHours: 24,
  sourceVersion,
  canonicalHash,
  audioRetentionDays: 30,
  gradingMode: "human_adjudicated_oral",
  sourceStatus: "retrieved_pending_review",
} as const;

export type QuestionSnapshot = {
  id: string;
  position: number;
  kind: "written" | "oral";
  prompt: string;
  referenceText: string;
  hadithNumber: number;
  sourceSelection: {
    windowStartWord: number;
    cueWords: 8;
    targetWords: 8;
    sourcePage: number;
    sourceUrl: string;
    boundarySelection: "primary-report" | "selected-primary-report";
  };
};

export function buildQuestions(random: () => number = Math.random): QuestionSnapshot[] {
  const windows: Array<{ number: number; start: number; cue: string; expected: string }> = [];
  for (const passage of canonicalPassages) {
    const words = passage.text.trim().split(/\s+/u).filter(Boolean);
    for (let start = 0; start + 16 <= words.length; start += 16) {
      windows.push({
        number: passage.number,
        start,
        cue: words.slice(start, start + 8).join(" "),
        expected: words.slice(start + 8, start + 16).join(" "),
      });
    }
  }
  if (windows.length < 30) {
    throw new Error("The explicitly bounded canonical text has fewer than 30 complete passages.");
  }
  const shuffled = [...windows];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  const questions: QuestionSnapshot[] = [];
  for (let position = 0; position < 30; position += 1) {
    const passage = shuffled[position]!;
    const source = canonicalPassages.find((item) => item.number === passage.number)!;
    const boundary = canonicalMatnBoundaries.find((item) => item.id === passage.number)!;
    questions.push({
      id: randomUUID(),
      position: position + 1,
      kind: position < 15 ? "written" : "oral",
      prompt: `${passage.cue} … أكمل الكلمات الثماني التالية فقط`,
      referenceText: passage.expected,
      hadithNumber: passage.number,
      sourceSelection: {
        windowStartWord: passage.start,
        cueWords: 8,
        targetWords: 8,
        sourcePage: source.sourcePage,
        sourceUrl: source.sourceUrl,
        boundarySelection: boundary.selection,
      },
    });
  }
  return questions;
}

export function selectedCanonicalHash(questions: QuestionSnapshot[]): string {
  const selectedNumbers = new Set(questions.map((question) => question.hadithNumber));
  const selectedRecords = canonicalPassages
    .filter((record) => selectedNumbers.has(record.number))
    .map((record) => ({
      id: record.number,
      sourcePage: record.sourcePage,
      sourceUrl: record.sourceUrl,
      text: record.text,
      selection: canonicalMatnBoundaries.find((boundary) => boundary.id === record.number)?.selection,
    }));
  const selections = questions.map(({ position, hadithNumber, prompt, referenceText, sourceSelection }) => ({
    position,
    hadithNumber,
    prompt,
    referenceText,
    sourceSelection,
  }));
  return createHash("sha256").update(JSON.stringify({ selectedRecords, selections })).digest("hex");
}

export function passageIdentityKey(
  sourceVersion: string,
  hadithNumber: number,
  windowStartWord: number,
  referenceText: string,
): string {
  return createHash("sha256")
    .update(JSON.stringify([
      "mateen-scheduled-passage-v1",
      sourceVersion,
      hadithNumber,
      windowStartWord,
      referenceText,
    ]))
    .digest("hex");
}

export function normalizeAssessmentText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, (mark) =>
      ["\u0653", "\u0654", "\u0655"].includes(mark) ||
        ["\u0653", "\u0654", "\u0655"].includes(mark.normalize("NFC"))
        ? mark
        : "",
    )
    .replace(/\u0640/gu, "")
    .replace(/\p{P}/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .normalize("NFC")
    .toLocaleLowerCase("ar");
}

export type WordDifference = {
  kind: "substitution" | "omission" | "extra";
  expectedWords: string[];
  submittedWords: string[];
};

export function compareWords(expected: string, submitted: string): WordDifference[] {
  const a = expected.split(/\s+/u).filter(Boolean);
  const b = submitted.split(/\s+/u).filter(Boolean);
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) table[i]![0] = i;
  for (let j = 0; j <= b.length; j += 1) table[0]![j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = normalizeAssessmentText(a[i - 1]!) === normalizeAssessmentText(b[j - 1]!) ? 0 : 1;
      table[i]![j] = Math.min(
        table[i - 1]![j]! + 1,
        table[i]![j - 1]! + 1,
        table[i - 1]![j - 1]! + cost,
      );
    }
  }
  const reversed: WordDifference[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 &&
      normalizeAssessmentText(a[i - 1]!) === normalizeAssessmentText(b[j - 1]!) &&
      table[i]![j] === table[i - 1]![j - 1]) {
      i -= 1;
      j -= 1;
    } else if (i > 0 && j > 0 && table[i]![j] === table[i - 1]![j - 1]! + 1) {
      reversed.push({ kind: "substitution", expectedWords: [a[i - 1]!], submittedWords: [b[j - 1]!] });
      i -= 1;
      j -= 1;
    } else if (i > 0 && table[i]![j] === table[i - 1]![j]! + 1) {
      reversed.push({ kind: "omission", expectedWords: [a[i - 1]!], submittedWords: [] });
      i -= 1;
    } else {
      reversed.push({ kind: "extra", expectedWords: [], submittedWords: [b[j - 1]!] });
      j -= 1;
    }
  }
  return reversed.reverse();
}

export function scoreExact(expected: string, submitted: string): 0 | 1 {
  return normalizeAssessmentText(expected) === normalizeAssessmentText(submitted) ? 1 : 0;
}