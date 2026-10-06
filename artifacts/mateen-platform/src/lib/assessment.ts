import { tr } from './i18n';
import type { AssessmentAttemptStatus } from '@workspace/api-client-react';

const KEY = 'mateen:exam-session';
/** One id per browser tab; the server uses it as the single-tab lease. */
type Store = Pick<Storage, 'getItem' | 'setItem'>;
export function tabSessionId(store: Store = sessionStorage, uuid: () => string = () => crypto.randomUUID()): string {
  let id = store.getItem(KEY);
  if (!id) { id = uuid(); store.setItem(KEY, id); }
  return id;
}
/** Server-acknowledged sequence + 1; a retry of the same draft reuses its mutationId. */
export const nextSequence = (q: { answerSequence: number }) => q.answerSequence + 1;
export function questionsVisible(status: AssessmentAttemptStatus, heartbeatLost: boolean, online: boolean) {
  return status === 'in_progress' && !heartbeatLost && online;
}
const draftKey = (attemptId: string, questionId: string) => `mateen:draft:${attemptId}:${questionId}`;
export function loadDraft(store: Store, attemptId: string, questionId: string, serverAnswer: string | null) {
  return store.getItem(draftKey(attemptId, questionId)) ?? serverAnswer ?? '';
}
export function saveDraft(store: Store & Partial<Pick<Storage, 'removeItem'>>, attemptId: string, questionId: string, text: string) {
  store.setItem(draftKey(attemptId, questionId), text);
}
export function clearDraft(store: Pick<Storage, 'removeItem'>, attemptId: string, questionId: string) {
  store.removeItem(draftKey(attemptId, questionId));
}
/** Pending mutation ids keyed by sequence+text so retries are idempotent. */
export function mutationIdFor(cache: Map<string, string>, sequence: number, text: string, uuid: () => string = newMutationId) {
  const k = `${sequence}:${text}`;
  let id = cache.get(k);
  if (!id) { id = uuid(); cache.set(k, id); }
  return id;
}
export function newMutationId() { return crypto.randomUUID(); }

export const STATUS_LABEL: Record<AssessmentAttemptStatus, string> = {
  get in_progress() { return tr("جارٍ"); }, get paused_connection() { return tr("متوقف لانقطاع الاتصال"); }, get submitted() { return tr("بانتظار المراجعة البشرية"); },
  get technical_review() { return tr("مراجعة تقنية"); }, get passed() { return tr("اجتاز"); }, get failed() { return tr("لم يجتز"); },
};
export const isFinal = (s: AssessmentAttemptStatus) => s === 'passed' || s === 'failed';
export const isPending = (s: AssessmentAttemptStatus) => s === 'submitted' || s === 'technical_review';

export function clock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
export function errorMessage(e: unknown, fallback: string) {
  const status = (e as { status?: number })?.status;
  if (status === 409) return tr("هذا الاختبار مفتوح في نافذة أخرى أو تغيّرت حالته. أغلق النافذة الأخرى ثم أعد المحاولة.");
  if (status === 429) return tr("محاولات كثيرة. انتظر قليلاً.");
  return fallback;
}

const OWNER_KEY = 'mateen:assessment-owner';
type Purgeable = { length: number; key(i: number): string | null; getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
function purge(s: Purgeable) {
  const keys: string[] = [];
  for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && (k.startsWith('mateen:draft:') || k === KEY)) keys.push(k); }
  keys.forEach((k) => s.removeItem(k));
}
/** Drafts and tab lease belong to one account; purge them when the signed-in user changes or signs out. */
export function claimAssessmentStorage(userId: string | null, local: Purgeable = localStorage, session: Purgeable = sessionStorage) {
  const owner = local.getItem(OWNER_KEY);
  if (userId === null) { purge(local); purge(session); local.removeItem(OWNER_KEY); return; }
  if (owner !== userId) { purge(local); purge(session); local.setItem(OWNER_KEY, userId); }
}

export const SESSION_HEADER = 'X-Assessment-Session';
/** Request options carrying this tab's own lease id (never a server-exposed value). */
export const sessionRequest = (sessionId: string) => ({ headers: { [SESSION_HEADER]: sessionId } });

/** Zero-based cursor, clamped to the question list. */
export const clampCursor = (p: number, total: number) => Math.max(0, Math.min(Math.max(0, total - 1), Math.floor(Number.isFinite(p) ? p : 0)));
/** Local latest cursor wins; stale server data never overwrites it. */
export const resolveCursor = (local: number | null, server: number | undefined, total: number) =>
  clampCursor(local ?? server ?? 0, total);
export const questionAnchor = (index: number) => `exam-q-${index}`;
