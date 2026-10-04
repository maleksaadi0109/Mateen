import { useEffect, useMemo, useRef, useState } from 'react';
import { recitationWords } from '@/lib/live-recitation';

export default function PassageSelection({ text, selected, onSelect, onAsk, busy, poem }: {
  text: string; poem?: { number: number; text: string }[]; selected: string | null; onSelect: (text: string | null) => void; onAsk: () => void; busy: boolean;
}) {
  const body = useRef<HTMLElement>(null);
  const words = useMemo(() => recitationWords(text), [text]);
  const [manual, setManual] = useState(false);
  const [start, setStart] = useState<number | null>(null);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [error, setError] = useState('');
  const choose = (value: string) => {
    const clean = value.replace(/\s+/g, ' ').trim();
    if (clean.length > 3000) { setError('المقطع طويل؛ حدّد مقطعًا أقصر من ٣٠٠٠ حرف.'); onSelect(null); return; }
    setError(''); onSelect(clean || null);
  };
  useEffect(() => {
    if (manual || busy) return;
    const capture = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount || !body.current) return;
      const r = selection.getRangeAt(0);
      if (!body.current.contains(r.startContainer) || !body.current.contains(r.endContainer)) return;
      // Only accept contiguous text from this hadith, never another page region.
      const value = selection.toString().replace(/\s+/g, ' ').trim();
      if (value && words.join(' ').includes(value)) choose(value);
    };
    document.addEventListener('selectionchange', capture);
    return () => document.removeEventListener('selectionchange', capture);
  }, [manual, busy, words, onSelect]);
  const clear = () => { onSelect(null); setStart(null); setRange(null); setError(''); window.getSelection()?.removeAllRanges(); };
  const pick = (index: number) => {
    if (start === null) { setStart(index); setRange([index, index]); onSelect(null); return; }
    const from = Math.min(start, index), to = Math.max(start, index);
    setRange([from, to]); setStart(null); choose(words.slice(from, to + 1).join(' '));
  };
  return (
    <div>
      <p className="mb-3 font-ui text-sm text-muted-foreground">
        حدّد عبارة أو مقطعًا بالسحب، أو بالضغط المطوّل على الجوال ثم تحريك مقابض التحديد.
      </p>
      <button type="button" disabled={busy} aria-pressed={manual} className="mb-4 min-h-11 rounded-xl border px-3 font-ui text-sm"
        data-testid="button-range-mode" onClick={() => { clear(); setManual(v => !v); }}>
        {manual ? 'العودة إلى التحديد بالسحب' : 'تحديد بالنقر على أول وآخر كلمة'}
      </button>
      {manual && <p role="status" className="mb-3 font-ui text-sm text-secondary">{start === null ? 'اضغط أول كلمة، ثم آخر كلمة في المقطع المطلوب.' : 'الآن اضغط آخر كلمة؛ سيُحدّد كل ما بينهما.'}</p>}
      {(() => {
        const mark = (i: number, word: string) => manual
          ? <span key={i}><button type="button" disabled={busy} onClick={() => pick(i)}
            aria-label={`تحديد الكلمة ${i + 1}: ${word}`} aria-pressed={!!range && i >= range[0] && i <= range[1]}
            className={`min-h-11 rounded px-0.5 ${range && i >= range[0] && i <= range[1] ? 'bg-secondary/20 text-secondary' : 'hover:bg-secondary/10'}`}
            data-testid={`button-word-${i}`}>{word}</button>{' '}</span>
          : <span key={i} data-word-index={i}>{word}{' '}</span>;
        if (!poem) return (
          <p ref={body as React.RefObject<HTMLParagraphElement>} className={`hadith-text text-2xl sm:text-[1.7rem] ${manual ? 'select-none' : 'select-text'}`} data-testid="text-hadith-body">
            {words.map((word, i) => mark(i, word))}
          </p>
        );
        let g = 0;
        return (
          <div ref={body as React.RefObject<HTMLDivElement>} className={`space-y-2 ${manual ? 'select-none' : 'select-text'}`} data-testid="text-hadith-body">
            {poem.map((v) => {
              const lines = v.text.split('\n').map((l) => l.trim()).filter(Boolean);
              let halves: string[][] = lines.map((l) => recitationWords(l));
              if (halves.length === 1) { const w = halves[0], m = Math.ceil(w.length / 2); halves = [w.slice(0, m), w.slice(m)]; }
              else if (halves.length > 2) halves = [halves.slice(0, Math.ceil(halves.length / 2)).flat(), halves.slice(Math.ceil(halves.length / 2)).flat()];
              return (
                <div key={v.number} dir="rtl" className="grid grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)] items-start gap-x-2 rounded-xl border-b border-border/60 pb-2" data-testid={`poem-verse-${v.number}`}>
                  <span aria-hidden className="mt-2 select-none text-center font-ui text-[0.7rem] font-bold text-secondary">{v.number}</span>
                  {halves.map((h, hi) => (
                    <p key={hi} className="hadith-text min-w-0 break-words text-[1.15rem] leading-[2.2] sm:text-2xl">
                      {h.map((w) => { const i = g++; return mark(i, w); })}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })()}
      {error && <p role="alert" className="mt-3 font-ui text-sm text-destructive">{error}</p>}
      {selected && <div className="mt-4 rounded-xl border border-secondary/30 bg-secondary/5 p-4" data-testid="selection-actions">
        <p className="font-ui text-xs font-bold text-secondary">المقطع المحدّد</p>
        <blockquote className="my-2 max-h-40 overflow-y-auto break-words font-arabic text-lg" data-testid="text-selected-passage">{selected}</blockquote>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={onAsk} data-testid="button-ask-passage" className="min-h-11 rounded-full bg-secondary px-4 font-ui font-bold text-secondary-foreground">اسأل عن المقطع</button>
          <button type="button" disabled={busy} onClick={clear} data-testid="button-clear-passage" className="min-h-11 rounded-full border px-4 font-ui text-sm">إلغاء التحديد</button>
        </div>
      </div>}
    </div>
  );
}