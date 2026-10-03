import { useEffect, useMemo, useRef, useState } from 'react';
import { matchRecitation, recitationWords } from '@/lib/live-recitation';

type SpeechResult = { isFinal: boolean; [index: number]: { transcript: string } };
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

export function useLiveRecitation(text: string) {
  const words = useMemo(() => recitationWords(text), [text]);
  const [revealed, setRevealed] = useState<boolean[]>(() => words.map(() => false));
  const [interimIndices, setInterimIndices] = useState<number[]>([]);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [heardText, setHeardText] = useState('');
  const [mismatchIndex, setMismatchIndex] = useState<number | null>(null);
  const [position, setPosition] = useState(0);
  const recognition = useRef<Recognition | null>(null);
  const committed = useRef<boolean[]>(words.map(() => false));
  const cursor = useRef(0);

  const stop = () => {
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
    const active = new Constructor();
    const baseMask = [...committed.current];
    const baseCursor = cursor.current;
    active.lang = 'ar-SA';
    active.continuous = true;
    active.interimResults = true;
    active.maxAlternatives = 1;
    recognition.current = active;
    setError('');
    setMismatchIndex(null);
    setHeardText('');
    active.onresult = (event) => {
      if (recognition.current !== active) return;
      let final = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const value = typeof result[0]?.transcript === 'string' ? result[0].transcript.slice(0,250_001) : '';
        if (result.isFinal) final += ` ${value}`;
        else interim += ` ${value}`;
        if (final.length + interim.length > 250_000) break;
      }
      // Never silently truncate a long continuous book session and then appear
      // to stop making progress. Resume explicitly from the committed position.
      if (final.length + interim.length > 250_000) {
        setError('بلغت جلسة التعرّف حدّها. استكمل التسميع من موضعك لبدء جلسة جديدة.');
        stop();
        return;
      }
      const aligned = matchRecitation(words, final, baseCursor);
      const finalSet = new Set(aligned.indices);
      committed.current = baseMask.map((visible, i) => visible || finalSet.has(i));
      cursor.current = aligned.cursor;
      setPosition(aligned.cursor);
      setRevealed([...committed.current]);
      setMismatchIndex(aligned.mismatchIndex);
      if (aligned.mismatchIndex !== null) {
        setHeardText(final.trim().slice(-500));
        stop();
        return;
      }
      const provisional = matchRecitation(words, `${final} ${interim}`, baseCursor);
      setInterimIndices(provisional.indices.filter((i) => !committed.current[i]));
      setHeardText(`${final} ${interim}`.trim().slice(-500));
      if (aligned.cursor >= words.length) stop();
    };
    active.onerror = ({ error: code }) => {
      if (recognition.current !== active) return;
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
      recognition.current = null;
      setListening(false);
      setInterimIndices([]);
    };
    try {
      active.start();
      setListening(true);
    } catch {
      stop();
      setError('تعذّر بدء الميكروفون. تأكّد من الإذن وعدم استخدامه في تطبيق آخر.');
    }
  };

  const reset = () => {
    stop();
    setMismatchIndex(null);
    cursor.current = 0;
    setPosition(0);
    committed.current = words.map(() => false);
    setRevealed([...committed.current]);
    setHeardText('');
    setError('');
  };
  const revealAll = () => {
    stop();
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
    cursor.current = index;
    setPosition(index);
    committed.current = words.map(() => false);
    setRevealed([...committed.current]);
    setMismatchIndex(null);
    setHeardText('');
    setError('');
  };

  return { words, revealed, interimIndices, listening, supported, error, heardText, mismatchIndex, cursor: position, start, stop, reset, revealAll, seek };
}