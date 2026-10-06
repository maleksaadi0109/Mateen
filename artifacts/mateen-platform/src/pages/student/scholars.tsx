import { tr } from '@/lib/i18n';
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { getGetScholarsQueryKey, useGetScholars } from '@workspace/api-client-react';
import { ScrollText, Search, ArrowLeft } from 'lucide-react';
import { EmptyState, ErrorState, LoadingList, Notice, PageHeader } from '@/components/mateen/bits';
import { usePageMeta } from '@/lib/mateen';
import { filterScholars, type Availability } from '@/lib/scholar-search';

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';

export default function ScholarsPage() {
  usePageMeta(tr("المشايخ | مَتِين"), tr("دليل تعريفي بالمعلمين المعتمدين."));
  const q = useGetScholars({ query: { enabled: true, queryKey: getGetScholarsQueryKey(), staleTime: 30_000, refetchOnMount: 'always' } });
  const [text, setText] = useState('');
  const [avail, setAvail] = useState<Availability>('all');
  const shown = useMemo(() => filterScholars(q.data ?? [], text, avail), [q.data, text, avail]);
  const dirty = text.trim() !== '' || avail !== 'all';
  const reset = () => { setText(''); setAvail('all'); };
  return (
    <div>
      <PageHeader eyebrow={tr("المشايخ")} title={tr("دليل المشايخ")}>{tr("للتعريف فقط. لا تُرسل منه أسئلة مباشرة؛ يصل المعلم إلى سؤالك عبر إحالة من المساعد العلمي عند تفعيله.")}</PageHeader>
      {q.isLoading ? <LoadingList /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <EmptyState icon={<ScrollText size={28} />} title={tr("لا مشايخ معتمدون بعد")}>{tr("يظهر هنا من اعتمدتهم المنصة فقط، بعد مراجعة مؤهلاتهم.")}</EmptyState>
      ) : (
        <div className="space-y-5">
          <Notice tone="brown" title={tr("معلومات تعريفية")}>{tr("لا يمكنك مراسلة أي شيخ من هذه الصفحة.")}</Notice>
          <div className="paper-card flex flex-col gap-4 p-5 md:flex-row md:items-end">
            <div className="flex-1">
              <label htmlFor="scholar-search" className="mb-1.5 block font-ui text-sm font-semibold">{tr("ابحث بالاسم أو التخصص")}</label>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input id="scholar-search" type="search" dir="rtl" value={text} onChange={(e) => setText(e.target.value)} placeholder={tr("مثال: الحديث، الفقه")}
                  className={`w-full rounded-xl border bg-background py-2.5 pe-3 ps-3 ps-9 font-ui ${focus}`} data-testid="input-scholar-search" />
              </div>
            </div>
            <div>
              <label htmlFor="scholar-avail" className="mb-1.5 block font-ui text-sm font-semibold">{tr("التوفر")}</label>
              <select id="scholar-avail" value={avail} onChange={(e) => setAvail(e.target.value as Availability)} className={`w-full rounded-xl border bg-background px-3 py-2.5 font-ui md:w-48 ${focus}`} data-testid="select-scholar-availability">
                <option value="all">{tr("الكل")}</option>
                <option value="available">{tr("متاح")}</option>
                <option value="unavailable">{tr("غير متاح حالياً")}</option>
              </select>
            </div>
            {dirty && <button type="button" onClick={reset} className={`rounded-full border px-5 py-2.5 font-ui text-sm font-semibold ${focus}`} data-testid="button-reset-filters">{tr("إعادة الضبط")}</button>}
          </div>
          <p className="font-ui text-sm text-muted-foreground" role="status" aria-live="polite" data-testid="text-result-count">
            {shown.length}{' '}{tr("من")}{' '}{q.data.length}{' '}{tr("من المشايخ")}</p>
          {!shown.length ? (
            <EmptyState icon={<Search size={28} />} title={tr("لا نتائج مطابقة")} action={<button type="button" onClick={reset} className={`rounded-full bg-primary px-6 py-2.5 font-ui text-sm font-semibold text-primary-foreground ${focus}`}>{tr("مسح البحث والتصفية")}</button>}>{tr("جرّب كلمات أقل أو غيّر التوفر.")}</EmptyState>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {shown.map((s) => (
                <article key={s.id} className="paper-card flex flex-col p-6 md:p-7" data-testid={`card-scholar-${s.id}`}>
                  <div className="flex items-center justify-between gap-3"><h3 className="font-display text-xl font-bold">{s.name}</h3>
                    <span className="shrink-0 rounded-full border px-3 py-1 font-ui text-xs font-bold">{s.available ? tr("متاح") : tr("غير متاح حالياً")}</span></div>
                  <p className="mt-2 font-ui text-sm font-semibold text-secondary">{s.specialties}</p>
                  <p className="mt-3 line-clamp-3 font-arabic leading-loose text-muted-foreground">{s.biography}</p>
                  <Link href={`/student/scholars/${encodeURIComponent(s.id)}`} className={`mt-4 inline-flex items-center gap-2 self-start rounded-full font-ui text-sm font-bold text-primary ${focus}`} data-testid={`link-scholar-${s.id}`}>{tr("عرض الملف")}{' '}<ArrowLeft size={15} />
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
