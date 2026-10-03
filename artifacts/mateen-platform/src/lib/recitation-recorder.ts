// Audio stays local until the user explicitly sends it; never an assessment.
export const MAX_RECORDING_SECONDS = 60;
export const MAX_RECORDING_BYTES = 10 * 1024 * 1024;

export type RecordingStatus = 'idle' | 'requesting' | 'recording' | 'stopping' | 'ready' | 'error';
export type RecordingSnapshot = {
  status: RecordingStatus;
  seconds: number;
  audioUrl: string | null;
  blob: Blob | null;
  error: string | null;
  supported: boolean;
};

export interface RecorderEnvironment {
  supported: boolean;
  getUserMedia: () => Promise<MediaStream>;
  createRecorder: (stream: MediaStream) => MediaRecorder;
  createUrl: (blob: Blob) => string;
  revokeUrl: (url: string) => void;
  now: () => number;
  setInterval: (callback: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval: (id: ReturnType<typeof setInterval>) => void;
}

function microphoneError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'لم يُسمح باستخدام الميكروفون. فعّل الإذن لهذا الموقع من إعدادات المتصفح ثم حاول مجددًا.';
  }
  if (name === 'NotFoundError') return 'لم نجد ميكروفونًا متصلًا. وصّل ميكروفونًا ثم حاول مجددًا.';
  if (name === 'NotReadableError') return 'تعذّر الوصول إلى الميكروفون. تحقق من أنه لا يُستخدم في تطبيق آخر.';
  return 'تعذّر بدء التسجيل. تحقق من الميكروفون وإعدادات المتصفح ثم حاول مجددًا.';
}

export function browserRecorderEnvironment(): RecorderEnvironment {
  const supported = typeof window !== 'undefined' && window.isSecureContext &&
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';
  return {
    supported,
    getUserMedia: () => navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
    createRecorder: (stream) => {
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find((type) => MediaRecorder.isTypeSupported(type));
      return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    },
    createUrl: (blob) => URL.createObjectURL(blob),
    revokeUrl: (url) => URL.revokeObjectURL(url),
    now: () => performance.now(),
    setInterval: (callback, ms) => setInterval(callback, ms),
    clearInterval: (id) => clearInterval(id),
  };
}

/** Separate from React so permission races and privacy cleanup can be tested. */
export class RecitationRecorderController {
  private snapshot: RecordingSnapshot;
  private listeners = new Set<() => void>();
  private generation = 0;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private byteCount = 0;
  private startedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private env: RecorderEnvironment;

  constructor(env: RecorderEnvironment) {
    this.env = env;
    this.snapshot = this.initial();
  }

  private initial(): RecordingSnapshot {
    return { status: 'idle', seconds: 0, audioUrl: null, blob: null, error: null, supported: this.env.supported };
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(next: RecordingSnapshot) {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }

  private releaseMicrophone() {
    if (this.timer !== null) this.env.clearInterval(this.timer);
    this.timer = null;
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* Release tracks below. */ }
    }
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.stream = null;
  }

  discard = () => {
    ++this.generation; // Also cancels permission requests that resolve after navigation.
    this.releaseMicrophone();
    this.chunks = [];
    this.byteCount = 0;
    if (this.snapshot.audioUrl) this.env.revokeUrl(this.snapshot.audioUrl);
    this.update(this.initial());
  };

  private fail(message: string) {
    this.discard();
    this.update({ ...this.initial(), status: 'error', error: message });
  }

  start = async () => {
    if (!['idle', 'error'].includes(this.snapshot.status)) return;
    if (!this.env.supported) {
      this.fail('التسجيل غير مدعوم هنا. افتح المنصة عبر اتصال آمن في متصفح يدعم تسجيل الصوت.');
      return;
    }
    this.discard();
    const generation = this.generation;
    this.update({ ...this.initial(), status: 'requesting' });
    let stream: MediaStream;
    try {
      stream = await this.env.getUserMedia();
    } catch (error) {
      if (generation === this.generation) this.fail(microphoneError(error));
      return;
    }
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    try {
      const recorder = this.env.createRecorder(stream);
      this.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (generation !== this.generation || !event.data.size) return;
        this.byteCount += event.data.size;
        if (this.byteCount > MAX_RECORDING_BYTES) {
          this.fail('تجاوز التسجيل حد ١٠ ميغابايت وحُذف. حاول تسجيل مقطع أقصر.');
          return;
        }
        this.chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (generation === this.generation) this.fail('انقطع التسجيل بسبب خطأ تقني وحُذف. حاول مجددًا.');
      };
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          if (generation === this.generation) this.fail('انقطع اتصال الميكروفون وحُذف التسجيل غير المكتمل. حاول مجددًا.');
        };
      });
      recorder.onstop = () => {
        if (generation !== this.generation) return;
        const seconds = Math.min(MAX_RECORDING_SECONDS, Math.floor((this.env.now() - this.startedAt) / 1000));
        const blob = new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' });
        this.releaseMicrophone();
        this.chunks = [];
        this.byteCount = 0;
        if (!blob.size) {
          this.fail('لم يصل صوت من الميكروفون. تحقق منه ثم حاول مجددًا.');
          return;
        }
        try {
          this.update({ ...this.initial(), status: 'ready', seconds, audioUrl: this.env.createUrl(blob), blob });
        } catch {
          this.fail('تعذّر تجهيز الصوت للاستماع وحُذف التسجيل. حاول مجددًا.');
        }
      };
      this.startedAt = this.env.now();
      recorder.start(250);
      this.update({ ...this.initial(), status: 'recording' });
      this.timer = this.env.setInterval(() => {
        const seconds = Math.min(MAX_RECORDING_SECONDS, Math.floor((this.env.now() - this.startedAt) / 1000));
        this.update({ ...this.snapshot, seconds });
        if (seconds >= MAX_RECORDING_SECONDS) this.stop();
      }, 200);
    } catch (error) {
      if (generation === this.generation) this.fail(microphoneError(error));
    }
  };

  stop = () => {
    if (this.snapshot.status !== 'recording' || !this.recorder) return;
    if (this.timer !== null) this.env.clearInterval(this.timer);
    this.timer = null;
    this.update({ ...this.snapshot, status: 'stopping' });
    try { this.recorder.stop(); } catch { this.fail('تعذّر إنهاء التسجيل وحُذف. حاول مجددًا.'); }
    // Stop capture immediately, without waiting for asynchronous final data.
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
  };
}