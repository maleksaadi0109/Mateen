import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Volume2, VolumeX } from 'lucide-react';
import { num } from '@/lib/mateen';
import { normalizeRecitationWord } from '@/lib/live-recitation';
import type { HadithSummary } from '@/lib/recitation-analysis';

export type RecitationIssue = { index: number; expected: string; heard: string; kind: 'substitution' | 'omission' | 'extra' };
export type StoredIssue = { index?: number; expected: string; heard: string; kind: RecitationIssue['kind'] };
export type HistoryEntry = { id: string; attemptId?: string; at: number; matched: number; attempted: number; issues: StoredIssue[]; analyses?: HadithSummary[] };

export const HISTORY_CAP = 50;
export const MAX_ISSUES = 100;
const MAX_WORD = 60;
const KINDS = new Set(['substitution', 'omission', 'extra']);
const keyFor = (userId: string) => `mateen:recitation-history:v1:${userId}`;

export function normalizeWord(w: string) {
  return normalizeRecitationWord(w);
}
const clip = (s: unknown) => (typeof s === 'string' ? s.slice(0, MAX_WORD) : '');
const count = (n: unknown) => (typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000 ? n : null);

function sanitizeAnalyses(raw: unknown, totalMatched: number, totalAttempted: number): HadithSummary[] | undefined {
  if (!Array.isArray(raw) || raw.length > 42 || !raw.length) return undefined;
  const out: HadithSummary[] = [];
  const seen = new Set<number>();
  for (const value of raw) {
    if (!value || typeof value !== 'object') return undefined;
    const o = value as Record<string, unknown>;
    const keys = ['id', 'number', 'start', 'end', 'totalWords', 'matched', 'substitutions', 'omissions', 'extras', 'attempted', 'heard', 'covered'] as const;
    const fields: Record<string, number> = {};
    for (const key of keys) {
      const n = count(o[key]);
      if (n == null) return undefined;
      fields[key] = n;
    }
    if (!fields.id || fields.number < 1 || fields.number > 42 || seen.has(fields.id) ||
        fields.end <= fields.start || fields.covered > fields.totalWords || fields.matched > fields.covered ||
        fields.totalWords > fields.end - fields.start || !fields.attempted ||
        fields.attempted !== fields.matched + fields.substitutions + fields.omissions + fields.extras ||
        fields.heard !== fields.matched + fields.substitutions + fields.extras ||
        typeof o.title !== 'string' || o.title.length > 500) return undefined;
    seen.add(fields.id);
    const successPercent = Math.round(100 * fields.matched / fields.attempted);
    out.push({ ...fields, title: o.title, successPercent, differencePercent: 100 - successPercent } as HadithSummary);
  }
  if (out.reduce((n, h) => n + h.matched, 0) !== totalMatched ||
      out.reduce((n, h) => n + h.attempted, 0) !== totalAttempted) return undefined;
  return out;
}

function sanitize(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryEntry[] = [];
  for (const e of raw.slice(0, HISTORY_CAP)) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    const matched = count(o.matched), attempted = count(o.attempted);
    const at = typeof o.at === 'number' && Number.isSafeInteger(o.at) && o.at > 0 && o.at <= 8_640_000_000_000_000 ? o.at : null;
    if (typeof o.id !== 'string' || o.id.length > 64 || matched == null || attempted == null || at == null || matched > attempted || !Array.isArray(o.issues)) continue;
    const issues: StoredIssue[] = [];
    for (const i of o.issues.slice(0, MAX_ISSUES)) {
      if (!i || typeof i !== 'object') continue;
      const ii = i as Record<string, unknown>;
      if (typeof ii.kind !== 'string' || !KINDS.has(ii.kind)) continue;
      const idx = count(ii.index);
      issues.push({ ...(idx != null ? { index: idx } : {}), expected: clip(ii.expected), heard: clip(ii.heard), kind: ii.kind as StoredIssue['kind'] });
    }
    const attemptId = typeof o.attemptId === 'string' && o.attemptId.length <= 64 ? o.attemptId : undefined;
    const analyses = sanitizeAnalyses(o.analyses, matched, attempted);
    out.push({ id: o.id, ...(attemptId ? { attemptId } : {}), at, matched, attempted, issues, ...(analyses ? { analyses } : {}) });
  }
  return out;
}

function read(userId: string | null): HistoryEntry[] {
  if (!userId) return [];
  try { const s = window.localStorage.getItem(keyFor(userId)); return s && s.length <= 1_000_000 ? sanitize(JSON.parse(s)) : []; }
  catch { return []; }
}

/** Device-local, per-Clerk-user history. Nothing leaves this browser. */
export function useRecitationHistory(userId: string | null) {
  const [state, setState] = useState<{ user: string | null; entries: HistoryEntry[] }>(() => ({ user: userId, entries: read(userId) }));
  // Derive synchronously so a previous account's entries never render for the new user.
  const entries = state.user === userId ? state.entries : read(userId);
  useEffect(() => { if (state.user !== userId) setState({ user: userId, entries: read(userId) }); }, [userId, state.user]);

  const save = useCallback((entry: Omit<HistoryEntry, 'id' | 'at'>): { ok: boolean; message?: string } => {
    if (!userId) return { ok: false, message: 'سجّل الدخول لحفظ النتيجة على هذا الجهاز.' };
    const existing = read(userId);
    const previous = existing.find(e => e.attemptId === entry.attemptId);
    const fresh: HistoryEntry = { id: previous?.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, at: previous?.at ?? Date.now(), ...entry };
    const next = sanitize([fresh, ...existing.filter(e => e.id !== previous?.id)]).slice(0, HISTORY_CAP);
    const serialized = JSON.stringify(next);
    if (serialized.length > 1_000_000) return { ok: false, message: 'بلغ السجل المحلي حد الحجم؛ لم تُحفظ النتيجة ولم يُحذف السجل السابق.' };
    for (;;) {
      try { window.localStorage.setItem(keyFor(userId), serialized); break; }
      catch {
        return { ok: false, message: 'مساحة التخزين في المتصفح ممتلئة أو غير متاحة، فلم تُحفظ النتيجة ولم يُحذف سجلك السابق.' };
      }
    }
    setState({ user: userId, entries: next });
    return { ok: true };
  }, [userId]);

  const clear = useCallback((): { ok: boolean; message?: string } => {
    if (!userId) return { ok: false, message: 'سجّل الدخول لإدارة السجل.' };
    try { window.localStorage.removeItem(keyFor(userId)); }
    catch { return { ok: false, message: 'تعذّر مسح السجل من تخزين المتصفح؛ لم يُحذف شيء.' }; }
    setState({ user: userId, entries: [] });
    return { ok: true };
  }, [userId]);

  /** Prior-attempt counts excluding a given attempt (so the current report never counts itself). */
  const countsExcluding = useCallback((attemptId?: string) => {
    const m = new Map<string, number>();
    for (const e of entries) {
      if (attemptId && e.attemptId === attemptId) continue;
      const seen = new Set<string>();
      for (const i of e.issues) { const k = normalizeWord(i.expected); if (k && !seen.has(k)) { seen.add(k); m.set(k, (m.get(k) ?? 0) + 1); } }
    }
    return m;
  }, [entries]);

  return { entries, save, clear, countsExcluding };
}

/** Pronounce with an available Arabic voice only; never falls back to another language. */
export function useArabicSpeech(onBeforeSpeak?: () => void) {
  const before = useRef(onBeforeSpeak);
  before.current = onBeforeSpeak;
  const [error, setError] = useState('');
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [checked, setChecked] = useState(false);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  useEffect(() => {
    if (!supported) { setChecked(true); return; }
    const synth = window.speechSynthesis;
    const pick = () => {
      const v = synth.getVoices().filter((x) => x.lang?.toLowerCase().startsWith('ar'));
      setVoice(v.find((x) => x.localService) ?? v[0] ?? null);
      setChecked(true);
    };
    pick();
    synth.addEventListener?.('voiceschanged', pick);
    const t = window.setTimeout(() => setChecked(true), 1500);
    return () => { synth.removeEventListener?.('voiceschanged', pick); window.clearTimeout(t); synth.cancel(); };
  }, [supported]);
  const speak = useCallback((text: string) => {
    if (!supported || !voice || !text) return;
    before.current?.(); // Stop the live microphone first so playback is never recognized as recitation.
    setError('');
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice; u.lang = voice.lang; u.rate = 0.8;
      u.onerror = (e) => { if (e.error !== 'canceled' && e.error !== 'interrupted') setError('تعذّر تشغيل نطق الكلمة في المتصفح.'); };
      synth.speak(u);
    } catch { setError('تعذّر تشغيل نطق الكلمة في المتصفح.'); }
  }, [supported, voice]);
  const cancel = useCallback(() => { if (supported) window.speechSynthesis.cancel(); }, [supported]);
  return { available: Boolean(voice), checked, speak, cancel, error };
}

export function PronounceButton({ word, speech }: { word: string; speech: ReturnType<typeof useArabicSpeech> }) {
  if (!speech.available) {
    return <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-dashed px-3 font-ui text-[11px] text-muted-foreground" data-testid="text-pronounce-unavailable"><VolumeX size={13} aria-hidden />{speech.checked ? 'لا يتوفر صوت عربي في المتصفح' : 'جارٍ البحث عن صوت عربي'}</span>;
  }
  return (
    <button type="button" onClick={() => speech.speak(word)} aria-label={`انطق الكلمة المتوقعة ${word}`}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-secondary/50 bg-card px-3 font-ui text-xs font-bold text-foreground hover:bg-secondary/10" data-testid="button-pronounce">
      <Volume2 size={13} aria-hidden />استمع — نطق آلي
    </button>
  );
}

export function SpeechError({ speech }: { speech: ReturnType<typeof useArabicSpeech> }) {
  return speech.error ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-1.5 font-ui text-[11px] text-destructive" data-testid="text-pronounce-error">{speech.error}</p> : null;
}

export function RecitationHistory({ entries, onClear, signedIn, speech }: { entries: HistoryEntry[]; onClear: () => { ok: boolean; message?: string }; signedIn: boolean; speech: ReturnType<typeof useArabicSpeech> }) {
  const [confirm, setConfirm] = useState(false);
  const [clearMsg, setClearMsg] = useState<{ ok: boolean; message?: string } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <section className="mx-auto max-w-[860px] rounded-2xl border bg-card/70 p-4 font-ui sm:p-5" aria-labelledby="recitation-history-title" data-testid="recitation-history">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="recitation-history-title" className="font-display text-lg font-bold">محاولاتك المحفوظة</h3>
          <p className="mt-1 text-[11px] text-muted-foreground" data-testid="text-history-local">محفوظة على هذا الجهاز وهذا المتصفح فقط، لحسابك الحالي. لا تُرفع إلى الخادم ولا تحتوي تسجيلاً صوتياً أو نصاً مسموعاً كاملاً. يُحتفظ بآخر {num(HISTORY_CAP)} محاولة، وحتى {num(MAX_ISSUES)} اختلاف لكل محاولة.</p>
        </div>
        {entries.length > 0 && (confirm
          ? <div className="flex gap-1">
              <button type="button" onClick={() => { setClearMsg(onClear()); setConfirm(false); }} className="min-h-9 rounded-full bg-destructive px-3 text-xs font-bold text-destructive-foreground" data-testid="button-history-clear-confirm">تأكيد المسح</button>
              <button type="button" onClick={() => setConfirm(false)} className="min-h-9 rounded-full border px-3 text-xs font-bold" data-testid="button-history-clear-cancel">إلغاء</button>
            </div>
          : <button type="button" onClick={() => { setConfirm(true); timer.current = window.setTimeout(() => setConfirm(false), 6000); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold text-muted-foreground hover:text-destructive" data-testid="button-history-clear"><Trash2 size={13} aria-hidden />مسح السجل</button>)}
      </div>
      {clearMsg && <p role={clearMsg.ok ? 'status' : 'alert'} className={`mt-3 rounded-lg px-3 py-1.5 text-[11px] ${clearMsg.ok ? 'bg-secondary/10' : 'bg-destructive/10 text-destructive'}`} data-testid="text-history-clear-status">{clearMsg.ok ? 'مُسح السجل من هذا المتصفح.' : clearMsg.message}</p>}
      <div className="mt-2"><SpeechError speech={speech} /></div>
      {!signedIn ? <p className="mt-3 text-xs text-muted-foreground">سجّل الدخول لعرض سجلك المحلي.</p>
        : entries.length === 0 ? <p className="mt-4 rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground" data-testid="text-history-empty">لا توجد محاولات محفوظة بعد. بعد إنهاء التسميع يمكنك اختيار «حفظ النتيجة».</p>
        : <ol className="mt-4 divide-y" data-testid="list-history">
            {entries.map((e) => (
              <li key={e.id} className="py-2.5 text-xs" data-testid={`history-entry-${e.id}`}>
                <details className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-lg px-1 py-1 hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary">
                <time dateTime={new Date(e.at).toISOString()} className="text-muted-foreground">{new Date(e.at).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' })}</time>
                <span className="font-bold">تطابق تقريبي {num(e.attempted ? Math.round((e.matched / e.attempted) * 100) : 0)}٪ <span className="font-normal text-muted-foreground">({num(e.matched)} من {num(e.attempted)} كلمة)</span></span>
                <span className="text-muted-foreground">{num(e.attempted - e.matched)} اختلاف محتمل <span className="text-secondary group-open:hidden">· عرض</span></span>
                </summary>
                {e.analyses?.length ? <ul className="mt-3 space-y-2" data-testid="history-hadith-analyses">
                  {e.analyses.map(h => <li key={h.id} className="rounded-lg border p-3 leading-relaxed" data-testid={`history-hadith-${h.number}`}>
                    <p className="font-bold">الحديث {num(h.number)} · {h.title}</p>
                    <p>مطابقة تقريبية {num(h.successPercent)}٪ · اختلاف {num(h.differencePercent)}٪</p>
                    <p className="text-muted-foreground">التقط المتصفح {num(h.heard)} كلمة · طابق {num(h.matched)} · اختلافات {num(h.substitutions + h.omissions + h.extras)} · الجزء المُغطّى {num(h.covered)} من {num(h.totalWords)}</p>
                  </li>)}
                </ul> : <p className="mt-2 text-muted-foreground">لا يوجد تفصيل حسب الحديث لهذه المحاولة السابقة.</p>}
                {e.issues.length === 0 ? <p className="mt-2 text-muted-foreground">لا اختلافات محفوظة.</p> : (
                  <ul className="mt-2 space-y-1.5">
                    {e.issues.map((i, k) => (
                      <li key={k} className="flex flex-wrap items-center gap-3 rounded-lg border bg-background/70 px-3 py-2" data-testid={`history-issue-${e.id}-${k}`}>
                        {i.index != null && <span className="text-[11px] text-muted-foreground">الكلمة {num(i.index + 1)}</span>}
                        {i.kind !== 'extra' && <span className="hadith-text text-lg"><span className="sr-only">المتوقع: </span>{i.expected}</span>}
                        {i.kind !== 'omission' && i.heard && <span className="hadith-text text-base text-red-700 dark:text-red-400"><span className="sr-only">المسموع: </span>{i.heard}</span>}
                        {i.kind !== 'extra' && i.expected && <PronounceButton word={i.expected} speech={speech} />}
                      </li>
                    ))}
                  </ul>
                )}
                </details>
              </li>
            ))}
          </ol>}
    </section>
  );
}
