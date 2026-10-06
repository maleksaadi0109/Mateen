import { tr } from './i18n';
type UploadAllocation = { uploadUrl: string; expiresAt: string };
type Acknowledgement = { acknowledged: boolean };
type UploadState = {
  blob: Blob;
  sequence: number;
  allocation: UploadAllocation | null;
  phase: 'allocate' | 'put' | 'confirm';
  allocate: (sequence: number) => Promise<UploadAllocation>;
};
type UploadOperations<T extends Acknowledgement> = {
  blob: Blob;
  sequence: number;
  allocate: (sequence: number) => Promise<UploadAllocation>;
  put: (allocation: UploadAllocation, blob: Blob) => Promise<void>;
  confirm: (sequence: number) => Promise<T>;
  cancel: () => Promise<void>;
  now?: () => number;
};

/** Keeps the same sequence and advances only after each server acknowledgement. */
export function createAssessmentAudioUpload<T extends Acknowledgement>() {
  let state: UploadState | null = null;
  let running: Promise<T> | null = null;

  const reset = () => {
    if (running) throw new Error(tr("انتظر انتهاء إرسال التسجيل."));
    state = null;
  };

  const send = (operations: UploadOperations<T>): Promise<T> => {
    if (running) return running;
    if (state && state.blob !== operations.blob) {
      return Promise.reject(new Error(tr("ألغِ الرفع السابق قبل إرسال تسجيل مختلف.")));
    }
    state ??= { blob: operations.blob, sequence: operations.sequence, allocation: null, phase: 'allocate', allocate: operations.allocate };
    const current = state;
    running = (async () => {
      // A lost confirmation response must retry confirmation, never PUT again.
      if (current.phase === 'put' && current.allocation
        && Date.parse(current.allocation.expiresAt) <= (operations.now ?? Date.now)()) {
        await operations.cancel();
        current.allocation = null;
        current.phase = 'allocate';
      }
      if (current.phase === 'allocate') {
        current.allocation = await current.allocate(current.sequence);
        current.phase = 'put';
      }
      if (current.phase === 'put') {
        if (!current.allocation) throw new Error(tr("لم يصل عنوان الرفع من الخادم."));
        await operations.put(current.allocation, current.blob);
        current.phase = 'confirm';
      }
      const acknowledgement = await operations.confirm(current.sequence);
      if (acknowledgement.acknowledged) state = null;
      return acknowledgement;
    })().finally(() => { running = null; });
    return running;
  };

  return { send, reset, hasPending: () => state !== null };
}