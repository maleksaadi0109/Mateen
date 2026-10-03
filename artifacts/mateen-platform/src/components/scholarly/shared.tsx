import { type ReactNode, useEffect, useState } from 'react';
import type { Citation } from '@workspace/api-client-react';
import { BookOpenText } from 'lucide-react';
import { num } from '@/lib/mateen';

export const field = 'w-full rounded-xl border bg-card px-4 py-3 font-ui text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary';
export const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-2.5 font-ui text-sm font-semibold text-primary-foreground disabled:opacity-50';
export const btnGhost = 'inline-flex items-center justify-center gap-2 rounded-full border px-5 py-2 font-ui text-sm font-semibold hover:bg-muted disabled:opacity-50';

const LABELS: Record<string, string> = {
  answered: 'أُجيب', unverified: 'لم يُعتمد علمياً', abstained: 'يحتاج متابعة', waiting_for_teacher: 'بانتظار معلم', referred: 'أُحيل إلى معلم',
  not_referred: 'دون إحالة', awaiting_reply: 'بانتظار الرد', draft: 'مسودة', reviewed: 'مراجَع', indexed: 'مفهرس', withdrawn: 'مسحوب',
  open: 'مفتوح', closed: 'مغلق', resolved: 'محلول',
};
export const label = (s: string) => LABELS[s] ?? s;

export function StatusPill({ status }: { status: string }) {
  return <span className="inline-block rounded-full border border-secondary/30 bg-card px-3 py-1 font-ui text-xs font-bold text-secondary" data-testid={`status-${status}`}>{label(status)}</span>;
}

export function Field({ label: l, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="font-ui text-sm font-semibold">{l}</span>{children}{hint && <span className="block font-ui text-xs text-muted-foreground">{hint}</span>}</label>;
}

export function CitationList({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <ol className="mt-4 space-y-3" data-testid="list-citations">
      {citations.map((c, i) => (
        <li key={`${c.passageId}-${i}`} className="rounded-2xl border border-secondary/25 bg-background p-4">
          <p className="flex items-center gap-2 font-ui text-sm font-bold"><BookOpenText size={16} className="text-secondary" />{c.sourceTitle} — {c.author}</p>
          <p className="mt-1 font-ui text-xs text-muted-foreground">
            الطبعة: {c.edition}{c.volume != null && <> · المجلد {num(c.volume)}</>}
            {c.printedPage && <> · الصفحة المطبوعة {c.printedPage}</>}
            {c.pdfPage != null && <> · صفحة PDF {num(c.pdfPage)}</>}
          </p>
          <blockquote className="mt-2 border-s-2 border-secondary ps-3 font-arabic text-base leading-loose">{c.quote}</blockquote>
        </li>
      ))}
    </ol>
  );
}

export const NO_FATWA = 'هذا المساعد يولّد شروحاً تعليمية آلية قد تخطئ؛ لا يصدر فتوى ولا يغني عن العالم المؤهل.';

/** Finite polling: returns interval ms until maxMs elapsed since mount/reset, then false. */
export function useFinitePoll(ms = 8000, maxMs = 300000, resetKey: unknown = null) {
  const [live, setLive] = useState(true);
  useEffect(() => { setLive(true); const t = setTimeout(() => setLive(false), maxMs); return () => clearTimeout(t); }, [maxMs, resetKey]);
  return live ? ms : false;
}
