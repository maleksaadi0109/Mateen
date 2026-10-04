import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetTeacherReviewsQueryKey, useDecideTeacherApplication, useGetTeacherReviews } from '@workspace/api-client-react';
import type { ReviewDecisionInputDecision, TeacherReview } from '@workspace/api-client-react';
import { AdminGate } from '@/components/admin/AdminGate';
import { DocDownload, History, Pill, toneOf } from '@/components/admin/parts';
import DocPreview from '@/components/admin/DocPreview';
import { EmptyState, ErrorState, LoadingList, PageHeader } from '@/components/mateen/bits';
import { APP_STATUS, DOC_KIND, DOC_STATUS, errMsg, fmtSize, invalidateReviewData } from '@/lib/admin';
import { fmtDate, num, usePageMeta } from '@/lib/mateen';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const DECISIONS: { v: ReviewDecisionInputDecision; t: string }[] = [
  { v: 'approved', t: 'قبول' }, { v: 'needs_information', t: 'طلب معلومات' }, { v: 'rejected', t: 'رفض' },
];

function Decide({ r }: { r: TeacherReview }) {
  const m = useDecideTeacherApplication();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [d, setD] = useState<ReviewDecisionInputDecision>('needs_information');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const docs = r.documents ?? [];
  const cleanCount = docs.filter((x) => x.status === 'clean' && x.contentType === 'application/pdf').length;
  const ok = r.status === 'pending_review' && reason.trim().length >= 5 && (d !== 'approved' || cleanCount > 0);
  const go = () => m.mutate({ userId: r.userId, data: { revision: r.revision ?? 0, decision: d, reason: reason.trim() } }, {
    onSuccess: () => { toast({ title: 'سُجّل القرار' }); setReason(''); setConfirm(false); invalidateReviewData(qc); },
    onError: () => setConfirm(false),
  });
  if (r.status !== 'pending_review') return <p className="rounded-xl bg-muted p-4 font-ui text-sm">لا قرار متاح: الطلب ليس قيد المراجعة (الحالة: {APP_STATUS[r.status]}). يُراجَع الطلب مجدداً بعد إعادة إرساله.</p>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (ok) setConfirm(true); }} className="space-y-3" data-testid="form-decision">
      <div role="radiogroup" aria-label="القرار" className="flex flex-wrap gap-2">
        {DECISIONS.map((x) => (
          <button type="button" key={x.v} role="radio" aria-checked={d === x.v} onClick={() => { setD(x.v); setConfirm(false); }} data-testid={`radio-decision-${x.v}`}
            className={cn('rounded-full border px-4 py-1.5 font-ui text-sm font-bold', d === x.v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{x.t}</button>
        ))}
      </div>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} rows={4} aria-label="السبب" placeholder="السبب (خمسة أحرف على الأقل). يظهر للمعلم."
        className="w-full rounded-xl border bg-background px-4 py-3 font-arabic text-lg leading-loose outline-none focus:border-secondary" data-testid="input-decision-reason" />
      {d === 'approved' && cleanCount === 0 ? <p className="font-ui text-xs text-red-800">القبول يحتاج شهادة PDF اجتازت الفحص الأمني.</p> : null}
      {m.isError ? <p className="font-ui text-sm text-red-800" role="alert" data-testid="text-decision-error">{errMsg(m.error)}</p> : null}
      {!confirm ? (
        <button type="submit" disabled={!ok} className="rounded-full bg-secondary px-6 py-2 font-ui text-sm font-bold text-secondary-foreground disabled:opacity-50" data-testid="button-decision-review">مراجعة القرار</button>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-secondary/50 p-3">
          <span className="font-ui text-sm font-bold">تأكيد: {DECISIONS.find((x) => x.v === d)?.t} (المراجعة رقم {num(r.revision ?? 0)})؟</span>
          <button type="button" onClick={go} disabled={m.isPending} className="rounded-full bg-secondary px-5 py-1.5 font-ui text-sm font-bold text-secondary-foreground disabled:opacity-50" data-testid="button-decision-confirm">{m.isPending ? 'جارٍ التسجيل…' : 'تأكيد'}</button>
          <button type="button" onClick={() => setConfirm(false)} className="font-ui text-sm underline">رجوع</button>
        </div>
      )}
    </form>
  );
}

function Queue() {
  const q = useGetTeacherReviews({ query: { queryKey: getGetTeacherReviewsQueryKey(), refetchInterval: 30_000 } });
  const [sel, setSel] = useState<string | null>(null);
  const [flt, setFlt] = useState('pending_review');
  if (q.isLoading) return <LoadingList rows={4} />;
  if (q.isError || !q.data) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  const list = q.data.filter((t) => flt === 'all' || t.status === flt);
  const cur = list.find((t) => t.userId === sel) ?? list[0];
  return (
    <div>
      <PageHeader eyebrow="مركز المراجعة" title="طلبات اعتماد المعلمين">افتح الطلب، اعرض شهادة PDF، ثم سجّل القبول أو الرفض مع السبب. الشهادات خاصة ولا تُعرض للطلاب.</PageHeader>
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {['pending_review', 'needs_information', 'approved', 'rejected', 'all'].map((s) => (
          <button key={s} onClick={() => setFlt(s)} role="tab" aria-selected={flt === s} data-testid={`filter-${s}`}
            className={cn('rounded-full border px-4 py-1 font-ui text-sm font-semibold', flt === s ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{s === 'all' ? 'الكل' : APP_STATUS[s]}</button>
        ))}
      </div>
      {!list.length ? <EmptyState title="لا طلبات في هذا التصنيف">ستظهر الطلبات المُرسلة هنا.</EmptyState> : (
        <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
          <ul className="space-y-2" data-testid="list-teacher-reviews">
            {list.map((t) => (
              <li key={t.userId}><button onClick={() => setSel(t.userId)} data-testid={`row-teacher-${t.userId}`}
                className={cn('w-full rounded-xl border p-4 text-right', cur?.userId === t.userId ? 'border-secondary bg-card' : 'hover:bg-muted')}>
                <p className="font-ui font-bold">{t.name}</p><div className="mt-1 flex items-center gap-2"><Pill tone={toneOf(t.status)}>{APP_STATUS[t.status]}</Pill><span className="font-ui text-xs text-muted-foreground">{fmtDate(t.submittedAt)}</span></div>
              </button></li>
            ))}
          </ul>
          {cur ? (
            <section className="paper-card space-y-6 p-6" data-testid="panel-teacher-detail">
              <div><h2 className="font-display text-2xl font-bold">{cur.name}</h2><p className="font-ui text-xs text-muted-foreground">المراجعة رقم {num(cur.revision ?? 0)}</p></div>
              <div><p className="font-ui text-sm font-bold">النبذة</p><p className="whitespace-pre-wrap font-arabic text-lg leading-loose">{cur.biography || '—'}</p></div>
              <div><p className="font-ui text-sm font-bold">التخصصات</p><p className="font-ui">{cur.specialties || '—'}</p></div>
              <div>
                <p className="mb-2 font-ui text-sm font-bold">الوثائق ({num((cur.documents ?? []).length)})</p>
                <ul className="space-y-2">{(cur.documents ?? []).map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3 font-ui text-sm">
                    <span className="min-w-0 break-all font-bold">{d.name}</span><Pill>{DOC_KIND[d.kind]}</Pill><Pill tone={toneOf(d.status)}>{DOC_STATUS[d.status]}</Pill>
                    <span className="text-xs text-muted-foreground">{fmtSize(d.size)}</span><span className="mr-auto flex flex-wrap gap-2">
                      {d.status === 'clean' && d.contentType === 'application/pdf' ? <DocPreview id={d.id} name={d.name} /> : null}
                      {d.status === 'clean' ? <DocDownload id={d.id} name={d.name} /> : null}
                    </span>
                  </li>))}</ul>
              </div>
              <Decide key={`${cur.userId}-${cur.revision}-${cur.status}`} r={cur} />
              <div><p className="mb-2 font-ui text-sm font-bold">سجل الطلب</p><History items={cur.history ?? []} /></div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
export default function AdminTeachers() {
  usePageMeta('طلبات المعلمين | مَتِين', 'طابور مراجعة مؤهلات المعلمين.');
  return <AdminGate need="qualification">{() => <Queue />}</AdminGate>;
}
