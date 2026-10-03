import { assessmentAudioTestState } from "./assessment-audio-state";

export class ObjectStorageService {
  createObjectEntityUploadPath(): string {
    const suffix = String(assessmentAudioTestState.nextUploadId++).padStart(12, "0");
    return `/objects/uploads/00000000-0000-4000-8000-${suffix}`;
  }

  async getObjectEntityUploadURLForPath(path: string, expiresAt: Date): Promise<string> {
    assessmentAudioTestState.signedUrls.push({ path, expiresAt: expiresAt.toISOString() });
    return `https://assessment-audio.test/upload${path}`;
  }

  normalizeObjectEntityPath(value: string): string {
    return value;
  }

  async getObjectEntityUploadURL(): Promise<string> {
    throw new Error("The integration test uses only durably reserved upload keys.");
  }
}