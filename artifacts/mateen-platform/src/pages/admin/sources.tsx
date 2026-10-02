import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/react';
import { getGetSourceReviewsQueryKey, useCreateSourceVersion, useDecideSourceVersion, useGetSourceReviews } from '@workspace/api-client-react';
import type { SourceDecisionInput, SourceVersion, SourceVersionInput } from '@workspace/api-client-react';
import { AdminGate } from '@/components/admin/AdminGate';
import { History, Pill, toneOf } from '@/components/admin/parts';
import { ErrorState, LoadingList, PageHeader } from '@/components/mateen/bits';
import { SRC_STATUS, errMsg, invalidateReviewData } from '@/lib/admin';
import { fmtDate, num, usePageMeta } from '@/lib/mateen';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const field = 'mt-1 w-full rounded-xl border bg-background px-3 py-2 font-ui text-sm outline-none focus:border-secondary';
const validUrl = (u: string) => { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } };

function Decision({ v }: { v: SourceVersion }) {
  const { userId } = useAuth();
  const m = useDecideSourceVersion();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [d, setD] = useState<SourceDecisionInput['decision']>('approved');
  const [sci, setSci] = useState<SourceDecisionInput['scientificStatus']>('approved');
  const [rights, setRights] = useState<SourceDecisionInput['rightsStatus']>('cleared');
  const [reason, setReason] = useState('');
  const [edition, setEdition] = useState(false);
  const independent = !!userId && userId !== v.createdBy;
  const checks = [
    { ok: sci === 'approved', t: 'الاعتماد العلمي: معتمد' }, { ok: rights === 'cleared', t: 'الحقوق: مُخلّاة' },
    { ok: independent, t: 'مراجع مستقل عن منشئ النسخة' }, { ok: v.rightsEvidence.trim().length > 0, t: 'دليل الحقوق غير فارغ' },
    { ok: validUrl(v.rightsUrl), t: 'رابط الحقوق صالح' }, { ok: edition, t: 'تحققتُ من الطبعة (' + v.edition + ')' },
  ];
  const approvalReady = checks.every((c) => c.ok);
  const ok = v.status === 'pending_review' && reason.trim().length >= 5 && (d !== 'approved' || approvalReady);
  const go = () => m.mutate({ versionId: v.id, data: { decision: d, scientificStatus: sci, rightsStatus: rights, reason: reason.trim() } }, {
    onSuccess: () => { toast({ title: 'سُجّل القرار' }); setReason(''); invalidateReviewData(qc); },
  });
  if (v.status !== 'pending_review') return <p className="rounded-xl bg-muted p-3 font-ui text-sm">لا قرار على نسخة {SRC_STATUS[v.status]}. أي تعديل يكون بنسخة لاحقة.</p>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (ok) go(); }} className="space-y-3 rounded-xl border p-4" data-testid={`form-source-decision-${v.id}`}>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="font-ui text-xs font-bold">القرار<select className={field} value={d} onChange={(e) => setD(e.target.value as typeof d)} data-testid="select-decision"><option value="approved">اعتماد</option><option value="rejected">رفض</option><option value="withdrawn">سحب</option></select></label>
        <label className="font-ui text-xs font-bold">الاعتماد العلمي<select className={field} value={sci} onChange={(e) => setSci(e.target.value as typeof sci)} data-testid="select-scientific"><option value="approved">معتمد</option><option value="pending">معلّق</option><option value="rejected">مرفوض</option></select></label>
        <label className="font-ui text-xs font-bold">الحقوق<select className={field} value={rights} onChange={(e) => setRights(e.target.value as typeof rights)} data-testid="select-rights"><option value="cleared">مُخلّاة</option><option value="pending">معلّقة</option><option value="rejected">مرفوضة</option></select></label>
      </div>
      <label className="flex items-center gap-2 font-ui text-sm"><input type="checkbox" checked={edition} onChange={(e) => setEdition(e.target.checked)} data-testid="check-edition" /> تحققتُ من الطبعة ومطابقة النص للصفحة المطبوعة</label>
      {d === 'approved' ? <ul className="space-y-1" data-testid="list-approval-checks">{checks.map((c) => <li key={c.t} className={cn('font-ui text-xs', c.ok ? 'text-emerald-800' : 'text-red-800')}>{c.ok ? '✓' : '✗'} {c.t}</li>)}</ul> : null}
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={2000} aria-label="سبب القرار" placeholder="سبب القرار (خمسة أحرف على الأقل)" className={field} data-testid="input-source-reason" />
      <p className="font-ui text-xs text-muted-foreground">هذه الفحوص إرشادية؛ الخادم هو الفيصل ويرفض الاعتماد غير المستوفي.</p>
      {m.isError ? <p className="font-ui text-sm text-red-800" role="alert" data-testid="text-source-error">{errMsg(m.error)}</p> : null}
      <button type="submit" disabled={!ok || m.isPending} className="rounded-full bg-secondary px-6 py-2 font-ui text-sm font-bold text-secondary-foreground disabled:opacity-50" data-testid="button-source-decide">{m.isPending ? 'جارٍ التسجيل…' : 'تسجيل القرار'}</button>
    </form>
  );
}

function Revision({ v, onDone }: { v: SourceVersion; onDone: () => void }) {
  const m = useCreateSourceVersion();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [f, setF] = useState<SourceVersionInput>({
    hadithNumber: v.hadithNumber, text: v.text, printedPage: v.printedPage, viewerPage: v.viewerPage, viewerUrl: v.viewerUrl,
    edition: v.edition, changeReason: '', rightsEvidence: v.rightsEvidence, rightsUrl: v.rightsUrl,
  });
  const set = <K extends keyof SourceVersionInput>(k: K, x: SourceVersionInput[K]) => setF((p) => ({ ...p, [k]: x }));
  const ok = f.text.trim().length >= 10 && f.edition.trim().length >= 3 && f.changeReason.trim().length >= 5 && f.printedPage >= 1 && f.viewerPage >= 1;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!ok) return; m.mutate({ data: { ...f, text: f.text.trim(), changeReason: f.changeReason.trim() } }, { onSuccess: () => { toast({ title: 'أُنشئت نسخة جديدة قيد المراجعة' }); invalidateReviewData(qc); onDone(); } }); }}
      className="space-y-3 rounded-xl border border-secondary/40 p-4" data-testid="form-new-version">
      <p className="font-ui text-sm font-bold">نسخة لاحقة للحديث {num(v.hadithNumber)} (لا يُعدَّل النص المعتمد في موضعه)</p>
      <label className="block font-ui text-xs font-bold">النص<textarea value={f.text} onChange={(e) => set('text', e.target.value)} rows={6} maxLength={12000} className={cn(field, 'font-arabic text-lg leading-loose')} data-testid="input-version-text" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="font-ui text-xs font-bold">الصفحة المطبوعة<input type="number" min={1} value={f.printedPage} onChange={(e) => set('printedPage', Number(e.target.value))} className={field} data-testid="input-printed-page" /></label>
        <label className="font-ui text-xs font-bold">صفحة العارض<input type="number" min={1} value={f.viewerPage} onChange={(e) => set('viewerPage', Number(e.target.value))} className={field} data-testid="input-viewer-page" /></label>
        <label className="font-ui text-xs font-bold sm:col-span-2">رابط العارض<input dir="ltr" value={f.viewerUrl} maxLength={1000} onChange={(e) => set('viewerUrl', e.target.value)} className={field} data-testid="input-viewer-url" /></label>
        <label className="font-ui text-xs font-bold sm:col-span-2">الطبعة<input value={f.edition} maxLength={1000} onChange={(e) => set('edition', e.target.value)} className={field} data-testid="input-edition" /></label>
        <label className="font-ui text-xs font-bold sm:col-span-2">دليل الحقوق<textarea value={f.rightsEvidence} maxLength={4000} rows={3} onChange={(e) => set('rightsEvidence', e.target.value)} className={field} data-testid="input-rights-evidence" /></label>
        <label className="font-ui text-xs font-bold sm:col-span-2">رابط الحقوق<input dir="ltr" value={f.rightsUrl} maxLength={1000} onChange={(e) => set('rightsUrl', e.target.value)} className={field} data-testid="input-rights-url" /></label>
        <label className="font-ui text-xs font-bold sm:col-span-2">سبب التغيير<input value={f.changeReason} maxLength={2000} onChange={(e) => set('changeReason', e.target.value)} className={field} data-testid="input-change-reason" /></label>
      </div>
      {m.isError ? <p className="font-ui text-sm text-red-800" role="alert" data-testid="text-version-error">{errMsg(m.error)}</p> : null}
      <div className="flex gap-3"><button type="submit" disabled={!ok || m.isPending} className="rounded-full bg-secondary px-6 py-2 font-ui text-sm font-bold text-secondary-foreground disabled:opacity-50" data-testid="button-create-version">{m.isPending ? 'جارٍ الإنشاء…' : 'إنشاء النسخة'}</button><button type="button" onClick={onDone} className="font-ui text-sm underline">إلغاء</button></div>
    </form>
  );
}

function Version({ v }: { v: SourceVersion }) {
  const [rev, setRev] = useState(false);
  return (
    <article className="paper-card space-y-4 p-5" data-testid={`card-version-${v.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-lg font-bold">النسخة {num(v.version)}</span>
        <Pill tone={toneOf(v.status)}>{SRC_STATUS[v.status]}</Pill><Pill tone={toneOf(v.scientificStatus)}>علمي: {SRC_STATUS[v.scientificStatus]}</Pill><Pill tone={toneOf(v.rightsStatus)}>حقوق: {SRC_STATUS[v.rightsStatus]}</Pill>
        <span className="mr-auto font-ui text-xs text-muted-foreground">{fmtDate(v.createdAt)} · المنشئ <span dir="ltr">{v.createdBy}</span></span>
      </div>
      <p className="whitespace-pre-wrap rounded-xl bg-muted/50 p-4 font-arabic text-xl leading-loose" data-testid={`text-version-${v.id}`}>{v.text}</p>
      <dl className="grid gap-3 font-ui text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">الطبعة</dt><dd>{v.edition || '—'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">الصفحة المطبوعة</dt><dd>{num(v.printedPage)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">صفحة العارض (ليست رقم الطباعة)</dt><dd>{num(v.viewerPage)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">رابط العارض</dt><dd className="break-all" dir="ltr">{v.viewerUrl ? <a className="text-secondary underline" href={v.viewerUrl} target="_blank" rel="noreferrer noopener">{v.viewerUrl}</a> : '—'}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">دليل الحقوق</dt><dd className="whitespace-pre-wrap">{v.rightsEvidence.trim() || 'لا دليل مسجّل بعد'}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">رابط الحقوق</dt><dd className="break-all" dir="ltr">{v.rightsUrl ? <a className="text-secondary underline" href={v.rightsUrl} target="_blank" rel="noreferrer noopener">{v.rightsUrl}</a> : '—'}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">سبب النسخة</dt><dd>{v.changeReason}</dd></div>
      </dl>
      <Decision v={v} />
      {rev ? <Revision v={v} onDone={() => setRev(false)} /> : <button onClick={() => setRev(true)} className="rounded-full border px-5 py-1.5 font-ui text-sm font-bold hover:bg-muted" data-testid={`button-revise-${v.id}`}>إنشاء نسخة لاحقة منها</button>}
      <div><p className="mb-2 font-ui text-sm font-bold">السجل (للقراءة فقط)</p><History items={v.history} /></div>
    </article>
  );
}

function Sources() {
  const q = useGetSourceReviews({ query: { queryKey: getGetSourceReviewsQueryKey(), refetchInterval: 30_000 } });
  const [n, setN] = useState(1);
  const by = useMemo(() => {
    const mp = new Map<number, SourceVersion[]>();
    (q.data ?? []).forEach((v) => mp.set(v.hadithNumber, [...(mp.get(v.hadithNumber) ?? []), v]));
    mp.forEach((a) => a.sort((x, y) => y.version - x.version));
    return mp;
  }, [q.data]);
  if (q.isLoading) return <LoadingList rows={4} />;
  if (q.isError || !q.data) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  const cur = by.get(n) ?? [];
  return (
    <div>
      <PageHeader eyebrow="مركز المراجعة" title="مصادر الأربعين النووية">اثنان وأربعون سجلاً. لا يُعدّ نص معتمداً قبل اعتماد علمي وإخلاء حقوق من مراجع غير منشئه، وتحقق من الطبعة.</PageHeader>
      <div className="grid gap-5 lg:grid-cols-[14rem_1fr]">
        <ul className="grid grid-cols-6 gap-1.5 lg:grid-cols-3" data-testid="grid-hadiths">
          {Array.from({ length: 42 }, (_, i) => i + 1).map((i) => {
            const latest = by.get(i)?.[0];
            const appr = by.get(i)?.some((v) => v.status === 'approved');
            return <li key={i}><button onClick={() => setN(i)} aria-label={`الحديث ${i}`} data-testid={`button-hadith-${i}`} className={cn('w-full rounded-lg border py-2 font-ui text-sm font-bold', n === i && 'ring-2 ring-secondary', appr ? 'bg-emerald-100 text-emerald-900' : latest?.status === 'pending_review' ? 'bg-amber-100 text-amber-900' : 'bg-card')}>{num(i)}</button></li>;
          })}
        </ul>
        <section className="space-y-5">
          <h2 className="font-display text-2xl font-bold">الحديث {num(n)}</h2>
          {!cur.length ? <p className="paper-card p-6 font-ui text-sm" data-testid="text-no-versions">لا نسخ مسجّلة لهذا الحديث.</p> : cur.map((v) => <Version key={v.id} v={v} />)}
        </section>
      </div>
    </div>
  );
}
export default function AdminSources() {
  usePageMeta('مصادر النصوص | مَتِين', 'مراجعة نسخ الأربعين النووية.');
  return <AdminGate need="content">{() => <Sources />}</AdminGate>;
}
