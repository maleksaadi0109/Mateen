import { intlTag } from '@/lib/i18n';
import { tr } from '@/lib/i18n';
import { useState } from 'react';
import type { ScholarlyCollation } from '@workspace/api-client-react';
import { btnGhost } from '@/components/scholarly/shared';
import CollationImage from './CollationImage';

const warning = () => tr('هذه مقارنة محدودة بمقاطع محددة فقط. ليست تحققاً من الصفحة كاملة، ولا اعتماداً علمياً، ولا إخلاءً للحقوق.');

export function CollationNotice() {
  return <p role="alert" className="rounded-xl border border-secondary/60 bg-secondary/10 p-3 font-ui text-sm font-bold" data-testid="text-collation-warning">{warning()}</p>;
}

export default function CollationReview({ sourceId, entry }: { sourceId: string; entry: ScholarlyCollation | undefined }) {
  const [open, setOpen] = useState(false);
  if (!entry) {
    return <div className="mt-2 space-y-2 rounded-xl border border-dashed p-3" data-testid="collation-absent"><CollationNotice /><p className="font-ui text-sm">{tr("لا يوجد دليل محلي مطابق لهذا المقطع. لا يُستنتج من ذلك أن الصفحة قد روجعت.")}</p></div>;
  }
  const c = entry;
  return (
    <section className="mt-3 space-y-3 rounded-xl border bg-background p-3" data-testid={`collation-${c.passageId}`}>
      <CollationNotice />
      <dl className="grid gap-1 font-ui text-xs sm:grid-cols-3">
        <div><dt className="font-bold">{tr("صفحة العارض (الموقع)")}</dt><dd>{c.viewerPage.toLocaleString(intlTag())}</dd></div>
        <div><dt className="font-bold">{tr("صفحة PDF")}</dt><dd>{c.pdfPage != null ? c.pdfPage.toLocaleString(intlTag()) : tr("غير محددة")}</dd></div>
        <div><dt className="font-bold">{tr("الصفحة المطبوعة")}</dt><dd>{c.printedPage ?? tr("غير محددة")}</dd></div>
      </dl>
      <p className="font-ui text-xs text-muted-foreground">{c.paginationNote}</p>
      {c.imageAvailable && <button type="button" className={btnGhost} onClick={() => setOpen(!open)} aria-expanded={open} data-testid={`button-collation-image-${c.passageId}`}>{open ? tr("إخفاء صورة الأصل") : tr("عرض صورة الأصل بجانب التصحيح")}</button>}
      <div className={open ? 'grid items-start gap-4 lg:grid-cols-2' : ''}>
      <div className="min-w-0 space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div><h4 className="font-ui text-sm font-bold">{tr("النص الأصلي")}</h4><p className="mt-1 whitespace-pre-wrap font-arabic leading-loose">{c.originalText}</p></div>
        <div><h4 className="font-ui text-sm font-bold">{tr("المسودة المصححة")}</h4>{c.correctedDraft ? <p className="mt-1 whitespace-pre-wrap font-arabic leading-loose">{c.correctedDraft}</p> : <p className="mt-1 font-ui text-sm text-muted-foreground">{tr("لا مسودة مصححة.")}</p>}</div>
      </div>
      {c.exclusionReason && <p className="font-ui text-sm"><b>{tr("سبب الاستبعاد:")}{' '}</b>{c.exclusionReason}</p>}
      <div>
        <h4 className="font-ui text-sm font-bold">{tr("مقتطفات الفروق (")}{c.excerpts.length.toLocaleString(intlTag())})</h4>
        {!c.excerpts.length && <p className="font-ui text-sm text-muted-foreground">{tr("لا مقتطفات مسجلة.")}</p>}
        <ul className="mt-2 space-y-2">
          {c.excerpts.map((x) => (
            <li key={x.id} className="rounded-lg border bg-card p-3" data-testid={`excerpt-${x.id}`}>
              <div className="grid gap-2 md:grid-cols-2">
                <div><span className="font-ui text-xs font-bold">{tr("قبل")}</span><p className="whitespace-pre-wrap font-arabic leading-loose">{x.originalText}</p></div>
                <div><span className="font-ui text-xs font-bold">{tr("بعد")}</span><p className="whitespace-pre-wrap font-arabic leading-loose">{x.correctedText}</p></div>
              </div>
              <p className="mt-1 font-ui text-xs">{tr("الفرق:")}{' '}{x.difference}</p>
              <p className="font-ui text-xs">{tr("الموضع:")}{' '}{x.location}{' '}{tr("· النطاق:")}{' '}{x.scope}</p>
              <p className="font-ui text-xs text-muted-foreground">{tr("حدود الموضع في النص الأصلي بوحدات UTF-16: البداية")}{' '}{x.originalStart}{tr("، النهاية")}{' '}{x.originalEnd}{' '}{tr("(غير مشمولة). ليست إحداثيات على الصورة.")}</p>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="font-ui text-sm font-bold">{tr("حدود المقارنة")}</h4>
        {c.limitations.length ? <ul className="list-disc ps-5 font-ui text-sm">{c.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul> : <p className="font-ui text-sm text-muted-foreground">{tr("لم تُذكر حدود، ولا يعني ذلك اكتمال التحقق.")}</p>}
      </div>
      </div>
      {open && <aside className="min-w-0 space-y-2 lg:sticky lg:top-0">
        <p className="font-ui text-sm font-bold">{tr("صورة الصفحة — الدليل الخاص")}</p>
        <CollationImage key={`${sourceId}:${c.passageId}:${c.imageSha256}:${c.originalTextSha256}`} sourceId={sourceId} entry={c} />
        <p className="break-all font-ui text-xs text-muted-foreground" dir="ltr">SHA-256: {c.imageSha256}</p>
      </aside>}
      </div>
      {!c.imageAvailable && <p className="font-ui text-sm text-muted-foreground">{tr("لا صورة محلية متاحة لهذا المقطع.")}</p>}
    </section>
  );
}
