import { useEffect, useMemo, useRef, useState } from 'react';
import { matchRecitation, matchContinuousRecitation, normalizeRecitationWord, recitationWords, type RecitationIssue } from '@/lib/live-recitation';

type SpeechResult = { isFinal: boolean; length?: number; [index: number]: { transcript: string; confidence?: number } };
type SpeechEvent = { results: { length: number; [index: number]: SpeechResult } };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop?(): void;
  abort(): void;
};
type RecognitionConstructor = new () => Recognition;
type SpeechWindow = Window & {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};

function speechConstructor() {
  const browser = window as SpeechWindow;
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}

export function useLiveRecitation(text: string, options: { continuousFeedback?: boolean } = {}) {
  const words = useMemo(() => recitationWords(text), [text]);
  const [revealed, setRevealed] = useState<boolean[]>(() => words.map(() => false));
  const [interimIndices, setInterimIndices] = useState<number[]>([]);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [heardText, setHeardText] = useState('');
  // Engagement counts final ASR words, not correct words or inferred omissions.
  // No transcript is sent to the activity endpoint.
  const [spokenWords, setSpokenWords] = useState(0);
  const spokenWordsRef = useRef(0);
  const [mismatchIndex, setMismatchIndex] = useState<number | null>(null);
  const [position, setPosition] = useState(0);
  const recognition = useRef<Recognition | null>(null);
  const keepListening = useRef(false);
  const restartTimer = useRef<number | null>(null);
  const emptyRestarts = useRef(0);
  const startRef = useRef<() => void>(() => {});
  const committed = useRef<boolean[]>(words.map(() => false));
  const cursor = useRef(0);
  const [issues, setIssues] = useState<RecitationIssue[]>([]);
  const issuesRef = useRef<RecitationIssue[]>([]);
  type Summary = { matchedCount: number; attemptedCount: number; issues: RecitationIssue[]; matchedIndices: number[]; spokenWords: number };
  const [finishing, setFinishing] = useState(false);
  const pendingFinish = useRef<{ resolve: (value: Summary | null) => void; timer: number } | null>(null);
  const snapshot = (): Summary => {
    const matchedCount = committed.current.reduce((n, visible, i) => n + (visible && normalizeRecitationWord(words[i]) ? 1 : 0), 0);
    const matchedIndices = committed.current.flatMap((visible, i) => visible && normalizeRecitationWord(words[i]) ? [i] : []);
    return { matchedCount, attemptedCount: matchedCount + issuesRef.current.length, issues: [...issuesRef.current], matchedIndices, spokenWords: spokenWordsRef.current };
  };
  const settleFinish = (keep: boolean) => {
    const pending = pendingFinish.current;
    if (!pending) return;
    pendingFinish.current = null;
    window.clearTimeout(pending.timer);
    setFinishing(false);
    pending.resolve(keep ? snapshot() : null);
  };
  const clearIssues = () => { issuesRef.current = []; setIssues([]); };

  const stop = () => {
    keepListening.current = false;
    if (restartTimer.current !== null) window.clearTimeout(restartTimer.current);
    restartTimer.current = null;
    settleFinish(false);
    const active = recognition.current;
    recognition.current = null; // Late callbacks cannot restore old text/mic state.
    if (active) {
      active.onresult = null;
      active.onerror = null;
      active.onend = null;
      try { active.abort(); } catch { /* already stopped */ }
    }
    setListening(false);
    setInterimIndices([]);
  };

  useEffect(() => {
    setSupported(Boolean(window.isSecureContext && speechConstructor()));
    clearIssues();
    setListening(false);
    committed.current = words.map(() => false);
    cursor.current = 0;
    setPosition(0);
    setRevealed(committed.current);
    setInterimIndices([]);
    setHeardText('');
    setMismatchIndex(null);
    setError('');
    return () => {
      keepListening.current = false;
      if (restartTimer.current !== null) window.clearTimeout(restartTimer.current);
      restartTimer.current = null;
      const pending = pendingFinish.current;
      pendingFinish.current = null;
      if (pending) { window.clearTimeout(pending.timer); pending.resolve(null); }
      const active = recognition.current;
      recognition.current = null;
      if (active) {
        active.onresult = null;
        active.onerror = null;
        active.onend = null;
        try { active.abort(); } catch { /* already stopped */ }
      }
    };
  }, [words]);

  const start = () => {
    if (recognition.current) return;
    const Constructor = speechConstructor();
    if (!Constructor || !window.isSecureContext) {
      setError('التسميع المباشر غير متاح في هذا المتصفح. استخدم متصفحاً يدعم التعرّف على الكلام عبر اتصال آمن، أو اكشف النص للقراءة.');
      return;
    }
    if (!words.length || cursor.current >= words.length) {
      setError('أعد الصفحة فارغة لبدء تسميع جديد.');
      return;
    }
    if (!keepListening.current) emptyRestarts.current = 0;
    keepListening.current = true;
    const active = new Constructor();
    const baseMask = [...committed.current];
    const baseCursor = cursor.current;
    const baseIssues = [...issuesRef.current];
    active.lang = 'ar-SA';
    active.continuous = true;
    active.interimResults = true;
    active.maxAlternatives = 3;
    recognition.current = active;
    let countedFinalWords = 0;
    setError('');
    setMismatchIndex(null);
    setHeardText('');
    active.onresult = (event) => {
      if (recognition.current !== active) return;
      let final = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        let value = typeof result[0]?.transcript === 'string' ? result[0].transcript.slice(0,250_001) : '';
        // Prefer only a more confident actual ASR hypothesis, independently of
        // the target. Selecting by reference similarity would hide real mistakes.
        if (result.isFinal) {
          let confidence = result[0]?.confidence;
          if (Number.isFinite(confidence) && confidence! >= 0 && confidence! <= 1) {
            for (let a = 1; a < Math.min(result.length ?? 1, 3); a++) {
              const alternate = result[a];
              if (typeof alternate?.transcript !== 'string' || alternate.transcript.length > 250_000 ||
                  !Number.isFinite(alternate.confidence) || alternate.confidence! > 1 || alternate.confidence! <= confidence!) continue;
                value = alternate.transcript;
                confidence = alternate.confidence;
            }
          }
        }
        if (result.isFinal) final += ` ${value}`;
        else interim += ` ${value}`;
        if (final.length + interim.length > 250_000) break;
      }
      const finalWordCount = recitationWords(final).filter(normalizeRecitationWord).length;
      const added = Math.max(0, finalWordCount - countedFinalWords);
      countedFinalWords = Math.max(countedFinalWords, finalWordCount);
      if (added) { emptyRestarts.current = 0; spokenWordsRef.current += added; setSpokenWords(spokenWordsRef.current); }
      // Never silently truncate a long continuous book session and then appear
      // to stop making progress. Resume explicitly from the committed position.
      if (final.length + interim.length > 250_000) {
        setError('بلغت جلسة التعرّف حدّها. استكمل التسميع من موضعك لبدء جلسة جديدة.');
        stop();
        return;
      }
      const continuous = options.continuousFeedback ? matchContinuousRecitation(words, final, baseCursor, baseMask) : null;
      const aligned = continuous ?? matchRecitation(words, final, baseCursor);
      if (continuous) {
        issuesRef.current = [...baseIssues, ...continuous.issues];
        setIssues(issuesRef.current);
      }
      const finalSet = new Set(aligned.indices);
      committed.current = baseMask.map((visible, i) => visible || finalSet.has(i));
      cursor.current = aligned.cursor;
      setPosition(aligned.cursor);
      setRevealed([...committed.current]);
      setMismatchIndex(options.continuousFeedback ? null : aligned.mismatchIndex);
      if (aligned.mismatchIndex !== null && !options.continuousFeedback) {
        setHeardText(final.trim().slice(-500));
        stop();
        return;
      }
      const provisional = options.continuousFeedback
        ? matchContinuousRecitation(words, `${final} ${interim}`, baseCursor, baseMask)
        : matchRecitation(words, `${final} ${interim}`, baseCursor);
      setInterimIndices(provisional.indices.filter((i) => !committed.current[i]));
      setHeardText(`${final} ${interim}`.trim().slice(-500));
      if (aligned.cursor >= words.length) { settleFinish(true); stop(); }
    };
    active.onerror = ({ error: code }) => {
      if (recognition.current !== active) return;
      // Silence is not a learner error. The browser ends this recognition
      // session next; onend reconnects without losing the committed position.
      if (code === 'no-speech' && keepListening.current && !pendingFinish.current) return;
      const messages: Record<string, string> = {
        'not-allowed': 'لم يُسمح بالميكروفون. اسمح باستخدامه من إعدادات الموقع ثم حاول مجدداً.',
        'service-not-allowed': 'خدمة التعرّف على الكلام غير مسموحة في هذا المتصفح. جرّب متصفحاً يدعمها.',
        'audio-capture': 'لم نعثر على ميكروفون متاح. تحقّق من توصيله وإعداداته.',
        'network': 'تعذّر الاتصال بخدمة التعرّف على الصوت. تحقّق من الاتصال ثم استكمل التسميع.',
        'no-speech': 'لم يُلتقط كلام واضح. اقترب من الميكروفون ثم استكمل التسميع.',
        'language-not-supported': 'التعرّف على العربية غير متاح في هذا المتصفح.',
      };
      if (code !== 'aborted') setError(messages[code] ?? 'توقف التعرّف على الصوت. يمكنك استكمال التسميع من موضعك.');
      stop();
    };
    active.onend = () => {
      if (recognition.current !== active) return;
      const restarting = keepListening.current && !pendingFinish.current && cursor.current < words.length;
      settleFinish(true);
      recognition.current = null;
      setInterimIndices([]);
      if (restarting && emptyRestarts.current++ < 5) {
        restartTimer.current = window.setTimeout(() => {
          restartTimer.current = null;
          if (keepListening.current) startRef.current();
        }, 350);
      } else {
        setListening(false);
        keepListening.current = false;
        if (restarting) setError('تعذّر استمرار خدمة الصوت بعد عدة محاولات. تحقّق من الميكروفون ثم اضغط متابعة؛ موضعك محفوظ.');
      }
    };
    try {
      active.start();
      setListening(true);
    } catch {
      stop();
      setError('تعذّر بدء الميكروفون. تأكّد من الإذن وعدم استخدامه في تطبيق آخر.');
    }
  };
  startRef.current = start;

  const reset = () => {
    stop();
    clearIssues();
    setMismatchIndex(null);
    cursor.current = 0;
    setPosition(0);
    committed.current = words.map(() => false);
    setRevealed([...committed.current]);
    setHeardText('');
    setError('');
  };
  // Unlike abort(), native stop() requests the final speech result before
  // ending capture. Bound the wait; navigation/reset cancels the pending review.
  const finish = async (): Promise<Summary | null> => {
    if (pendingFinish.current) return null;
    keepListening.current = false;
    if (restartTimer.current !== null) window.clearTimeout(restartTimer.current);
    restartTimer.current = null;
    const active = recognition.current;
    if (!active?.stop) { const result = snapshot(); stop(); return result; }
    setFinishing(true);
    return new Promise(resolve => {
      const timer = window.setTimeout(() => { settleFinish(true); stop(); }, 2000);
      pendingFinish.current = { resolve, timer };
      try { active.stop!(); } catch { settleFinish(false); stop(); setError('تعذّر إنهاء التقاط الصوت. يمكنك إعادة فتح مراجعة الكلمات المثبتة.'); }
    });
  };
  const revealAll = () => {
    stop();
    clearIssues();
    setMismatchIndex(null);
    cursor.current = words.length;
    setPosition(words.length);
    committed.current = words.map(() => true);
    setRevealed([...committed.current]);
    setError('');
  };

  const seek = (index: number) => {
    if (!Number.isSafeInteger(index) || index < 0 || index > words.length) return;
    stop();
    clearIssues();
    cursor.current = index;
    setPosition(index);
    committed.current = words.map(() => false);
    setRevealed([...committed.current]);
    setMismatchIndex(null);
    setHeardText('');
    setError('');
  };

  const matchedCount = revealed.reduce((count, visible, i) => count + (visible && normalizeRecitationWord(words[i]) ? 1 : 0), 0);
  return { words, revealed, interimIndices, listening, supported, error, heardText, mismatchIndex, cursor: position, start, stop, reset, revealAll, seek,
    issues, matchedCount, attemptedCount: matchedCount + issues.length, spokenWords, finish, finishing };
}