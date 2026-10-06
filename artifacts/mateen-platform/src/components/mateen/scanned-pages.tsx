import { fmt } from '@/lib/i18n';
import { tr } from '@/lib/i18n';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { RecitationPages } from '@workspace/api-client-react';
import { visibleRegions } from '@/lib/scanned-pages';
import { num } from '@/lib/mateen';

/** Pure renderer: blank page-proportioned sheets; the original image is drawn only
 * through clip rectangles of fully revealed regions. A page with no visible region
 * never references its image URL. */
export function ScannedPages({ data, revealed, onImageError, idPrefix = 'scan' }: {
  data: RecitationPages;
  revealed: boolean[];
  onImageError: () => void;
  idPrefix?: string;
}) {
  const [index, setIndex] = useState(0);
  const pages = data.pages;
  const i = Math.min(index, pages.length - 1);
  const page = pages[i];
  const shown = visibleRegions(data.regions, revealed, page.page);
  const clipId = `${idPrefix}-clip-${page.page}`;
  const heading = data.heading && data.heading.page === page.page ? data.heading : null;
  const clips = heading ? 1 + shown.length : shown.length;
  const unmapped = data.unmappedIndices.length;

  return (
    <div className="space-y-3" data-testid="scanned-pages">
      <div className="mx-auto w-full max-w-[820px] overflow-hidden rounded-xl border border-secondary/30 bg-[hsl(var(--card))] shadow-sm">
        <svg viewBox={`0 0 ${page.width} ${page.height}`} className="block h-auto w-full" role="img"
          aria-label={fmt("صفحة الكتاب {a}: ظهر {b} موضع", "Book page {a}: {b} position(s) shown", { a: num(page.page), b: num(shown.length) })} data-testid={`scan-page-${page.page}`}>
          <rect width={page.width} height={page.height} fill="hsl(var(--background))" />
          {clips > 0 && <>
            <defs>
              <clipPath id={clipId}>
                {heading && <rect x={heading.x} y={heading.y} width={heading.width} height={heading.height} data-testid="scan-heading-rect" />}
                {shown.map((r, k) => <rect key={k} x={r.x} y={r.y} width={r.width} height={r.height} data-testid="scan-clip-rect" />)}
              </clipPath>
            </defs>
            <image href={page.imageUrl} x={0} y={0} width={page.width} height={page.height} clipPath={`url(#${clipId})`}
              preserveAspectRatio="none" onError={onImageError} data-testid="scan-image" />
          </>}
        </svg>
      </div>
      {pages.length > 1 && (
        <div className="flex items-center justify-center gap-3 font-ui text-sm">
          <button type="button" onClick={() => setIndex(i - 1)} disabled={i === 0} aria-label={tr("الصفحة السابقة")}
            className="inline-flex min-h-10 items-center gap-1 rounded-full border px-4 disabled:opacity-40" data-testid="button-scan-prev"><ChevronRight size={15} />{tr("السابقة")}</button>
          <span aria-live="polite" data-testid="text-scan-page-count">{tr("صفحة")}{' '}{num(i + 1)}{' '}{tr("من")}{' '}{num(pages.length)}</span>
          <button type="button" onClick={() => setIndex(i + 1)} disabled={i === pages.length - 1} aria-label={tr("الصفحة التالية")}
            className="inline-flex min-h-10 items-center gap-1 rounded-full border px-4 disabled:opacity-40" data-testid="button-scan-next">{tr("التالية")}<ChevronLeft size={15} /></button>
        </div>
      )}
      {unmapped > 0 && (
        <p className="rounded-xl border bg-muted/40 p-3 font-ui text-xs text-muted-foreground" data-testid="text-scan-unmapped">
          {num(unmapped)}{' '}{tr("كلمة لم تُحدَّد مواضعها على الصورة بعد، فلن تظهر فيها. هذا نقص في المطابقة الفنية، وليس خطأً منك.")}</p>
      )}
    </div>
  );
}
