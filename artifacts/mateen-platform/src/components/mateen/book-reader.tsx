import { fmt } from '@/lib/i18n';
import { tr } from '@/lib/i18n';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import type { NawawiBook } from '@workspace/api-client-react';
import { num } from '@/lib/mateen';

/** Full original book pages for browsing. Never hides anything; recitation mode lives elsewhere. */
export function BookReader({ book, isLoading, isError, onRetry, hadithId }: {
  book?: NawawiBook; isLoading: boolean; isError: boolean; onRetry: () => void; hadithId: number;
}) {
  const [broken, setBroken] = useState<Record<number, boolean>>({});
  const [attempts, setAttempts] = useState<Record<number, number>>({});
  const pages = book?.pages ?? [];
  const first = book?.hadithPages.find((x) => x.hadithId === hadithId)?.firstPage;
  const startIdx = Math.max(0, pages.findIndex((p) => p.page === first));
  const [idx, setIdx] = useState(startIdx);
  const [syncedFor, setSyncedFor] = useState<string>('');
  const syncKey = `${hadithId}:${book ? pages.length : 0}:${first ?? ''}`;
  if (book && syncedFor !== syncKey) { setSyncedFor(syncKey); setIdx(startIdx); }

  if (isLoading) return <div className="skel h-80 w-full" role="status" aria-label={tr("جارٍ تحميل صفحات الكتاب")} data-testid="book-loading" />;
  if (isError || !book || pages.length === 0) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 font-ui text-sm" role="alert" data-testid="book-error">
        <p className="text-destructive">{tr("تعذّر تحميل صفحات الكتاب الأصلية.")}</p>
        <button type="button" onClick={onRetry} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border px-5 font-bold" data-testid="button-book-retry"><RefreshCw size={15} />{tr("إعادة المحاولة")}</button>
      </div>
    );
  }
  const spread = false;
  const step = spread ? 2 : 1;
  const i = Math.min(Math.max(0, idx), pages.length - 1);
  const shown = pages.slice(i, i + step);
  const last = Math.min(pages.length, i + step);
  const hp = book.hadithPages.find((x) => x.hadithId === hadithId);
  const inHadith = (p: number) => !!hp && p >= hp.firstPage && p <= hp.lastPage;

  return (
    <div className="space-y-3" data-testid="book-reader">
      <div className={`mx-auto grid gap-1 rounded-2xl border border-secondary/30 bg-muted/40 p-1.5 shadow-[0_18px_40px_-24px_hsl(var(--primary)/0.45)] sm:p-2 ${spread ? 'max-w-[1100px] grid-cols-2' : 'max-w-[820px]'}`} dir="rtl">
        {shown.map((p) => (
          <figure key={`${p.page}:${attempts[p.page] ?? 0}`} className="relative m-0 overflow-hidden rounded bg-card" data-testid={`book-page-${p.page}`}>
            <img src={p.imageUrl} width={p.width} height={p.height} alt={fmt("صفحة الكتاب {a}", "Book page {a}", { a: num(p.page) })} loading="lazy" className="block h-auto w-full"
              onError={() => setBroken((b) => ({ ...b, [p.page]: true }))} />
            {inHadith(p.page) && <span className="absolute right-2 top-2 rounded-full bg-secondary px-2 py-0.5 font-ui text-[11px] font-bold text-secondary-foreground">{tr("موضع الحديث")}</span>}
          </figure>
        ))}
      </div>
      {shown.filter((p) => broken[p.page]).map((p) => (
        <div key={p.page} className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 font-ui text-sm" role="alert" data-testid={`book-page-error-${p.page}`}>
          <span className="text-destructive">{tr("تعذّر تحميل صورة الصفحة")}{' '}{num(p.page)}.</span>
          <button type="button" onClick={() => {
            setBroken((b) => ({...b, [p.page]: false}));
            setAttempts((a) => ({...a, [p.page]: (a[p.page] ?? 0)+1}));
          }} className="me-3 ms-3 inline-flex min-h-11 items-center gap-2 rounded-full border px-4 font-bold" data-testid={`button-page-retry-${p.page}`}><RefreshCw size={14} />{tr("إعادة المحاولة")}</button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-center gap-2 font-ui text-xs sm:text-sm">
        <button type="button" onClick={() => setIdx(Math.max(0, i - step))} disabled={i === 0} aria-label={tr("الصفحة السابقة")} className="inline-flex min-h-10 items-center gap-1 rounded-full border px-3 disabled:opacity-40" data-testid="button-book-prev"><ChevronRight size={15} />{tr("السابقة")}</button>
        <span aria-live="polite" data-testid="text-book-page-count">{shown.length > 1 ? fmt("الصفحتان {a}–{b}", "Pages {a}–{b}", { a: num(shown[0].page), b: num(shown[shown.length - 1].page) }) : fmt("صفحة {a}", "Page {a}", { a: num(shown[0].page) })}{' '}{tr("من")}{' '}{num(pages.length)}</span>
        <button type="button" onClick={() => setIdx(i + step)} disabled={last >= pages.length} aria-label={tr("الصفحة التالية")} className="inline-flex min-h-10 items-center gap-1 rounded-full border px-3 disabled:opacity-40" data-testid="button-book-next">{tr("التالية")}<ChevronLeft size={15} /></button>
        {first && <button type="button" onClick={() => setIdx(startIdx)} className="inline-flex min-h-10 items-center rounded-full border px-3" data-testid="button-book-to-hadith">{tr("إلى صفحة الحديث")}</button>}
      </div>
    </div>
  );
}
