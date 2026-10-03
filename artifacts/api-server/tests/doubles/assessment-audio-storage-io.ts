import { assessmentAudioTestState } from "./assessment-audio-state";

export function canonicalizeContentType(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim().toLowerCase().replace(/\s*;\s*/g, ";");
}

export async function removeRemoteAudio(path: string | null | undefined): Promise<void> {
  if (!path) return;
  if (assessmentAudioTestState.failDeletesRemaining > 0) {
    assessmentAudioTestState.failDeletesRemaining -= 1;
    throw new Error("Simulated object-store deletion failure.");
  }
  assessmentAudioTestState.uploadObjects.delete(path);
  assessmentAudioTestState.frozenObjects.delete(path);
}

export async function getStorageFile(): Promise<never> {
  throw new Error("File reads are not part of the audio reservation HTTP integration test.");
}