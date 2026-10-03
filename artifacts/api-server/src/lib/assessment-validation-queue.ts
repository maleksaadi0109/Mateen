import { SingleWorkerQueue } from "./recitation-queue";

const queue = new SingleWorkerQueue(3);
type Job = {
  promise: Promise<{ durationSeconds: number; actualSizeBytes: number; frozenStoragePath: string }>;
  abort: () => void;
  cancelPending: () => boolean;
};
const jobs = new Map<string, Job>();
const VALIDATION_TOTAL_DEADLINE_MS = 90_000;

export function validateAssessmentAudioQueued(
  id: string,
  run: (signal: AbortSignal) => Promise<{ durationSeconds: number; actualSizeBytes: number; frozenStoragePath: string }>,
  requestSignal?: AbortSignal,
): Promise<{ durationSeconds: number; actualSizeBytes: number; frozenStoragePath: string }> | null {
  const existing = jobs.get(id);
  if (existing) return existing.promise;
  if (!queue.canAccept(id)) return null;

  const controller = new AbortController();
  let resolveJob!: (value: { durationSeconds: number; actualSizeBytes: number; frozenStoragePath: string }) => void;
  let rejectJob!: (reason: Error) => void;
  let settled = false;
  let deadlineTimer: NodeJS.Timeout;
  const promise = new Promise<{ durationSeconds: number; actualSizeBytes: number; frozenStoragePath: string }>((resolve, reject) => {
    resolveJob = resolve;
    rejectJob = reject;
  });
  const settle = (error?: Error, value?: { durationSeconds: number; actualSizeBytes: number; frozenStoragePath: string }) => {
    if (settled) return;
    settled = true;
    if (error) rejectJob(error);
    else resolveJob(value!);
  };
  const abort = () => {
    if (controller.signal.aborted) return;
    controller.abort();
    if (queue.cancelPending(id)) {
      clearTimeout(deadlineTimer);
      requestSignal?.removeEventListener("abort", onRequestAbort);
      jobs.delete(id);
      settle(new Error("Audio validation was cancelled."));
    }
  };
  const onRequestAbort = () => abort();
  deadlineTimer = setTimeout(abort, VALIDATION_TOTAL_DEADLINE_MS);
  deadlineTimer.unref();
  requestSignal?.addEventListener("abort", onRequestAbort, { once: true });
  jobs.set(id, {
    promise,
    abort,
    cancelPending: () => queue.cancelPending(id),
  });
  const accepted = queue.enqueue(id, async () => {
    try {
      const result = await run(controller.signal);
      settle(undefined, result);
    } catch (error) {
      settle(error instanceof Error ? error : new Error("Audio validation failed."));
    } finally {
      clearTimeout(deadlineTimer);
      requestSignal?.removeEventListener("abort", onRequestAbort);
      jobs.delete(id);
    }
  });
  if (!accepted) {
    clearTimeout(deadlineTimer);
    requestSignal?.removeEventListener("abort", onRequestAbort);
    jobs.delete(id);
    return null;
  }
  return promise;
}

export function assessmentAudioValidationQueueSize() {
  return queue.size;
}

export function isAssessmentAudioValidationActive(id: string): boolean {
  return jobs.has(id);
}

export function cancelAssessmentAudioValidation(id: string): void {
  jobs.get(id)?.abort();
}

export function assessmentAudioValidationJobId(
  attemptId: string,
  questionId: string,
  sequence: number,
): string {
  return `${attemptId}:${questionId}:${sequence}`;
}