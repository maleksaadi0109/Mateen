import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetScholarlyConfigQueryKey, getListScholarlyAuditQueryKey, getListScholarlyIssuesQueryKey, getListScholarlySourcesQueryKey, useCreateScholarlyPassage, useCreateScholarlySource, useGetScholarlyConfig, useListScholarlyAudit, useListScholarlyIssues, useListScholarlySources, useModerateScholarlyIssue, useRecordScholarlyEvaluation, useReviewScholarlySource, useUpdateScholarlyConfig, useWithdrawScholarlySource } from '@workspace/api-client-react';
import type { ScholarlySource } from '@workspace/api-client-react';
import { EmptyState, ErrorState, LoadingList, PageHeader } from '@/components/mateen/bits';
import { getListScholarlyPassagesQueryKey, useListScholarlyPassages } from '@workspace/api-client-react';
import { useIndexScholarlySource } from '@workspace/api-client-react';
import { CitationList } from '@/components/scholarly/shared';
import { Field, StatusPill, btnGhost, btnPrimary, field } from '@/components/scholarly/shared';
import { Link } from 'wouter';
import { AdminGate } from '@/components/admin/AdminGate';
import { fmtDate, usePageMeta } from '@/lib/mateen';
import { useToast } from '@/hooks/use-toast';

const forbidden = (e: unknown) => (e as { status?: number } | null)?.status === 403 || (e as { status?: number } | null)?.status === 401;

function Denied() {
  return <EmptyState title="لا صلاحية لك هنا">هذه الصفحة لإدارة المصادر العلمية، والخادم لم يمنحك الإذن بالدخول إليها.</EmptyState>;
}

function SourceForm() {
  const qc = useQueryClient(); const { toast } = useToast(); const m = useCreateScholarlySource();
  const [f, setF] = useState({ title: '', author: '', edition: '', publisher: '', version: '', legalAuthorization: 'public_domain' as 'public_domain' | 'licensed' | 'permission_granted', authorizationReference: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const ok = f.title.trim() && f.author.trim() && f.edition.trim() && f.version.trim() && f.authorizationReference.trim();
  return (
    <form className="paper-card grid gap-4 p-6 md:grid-cols-2" data-testid="form-source" onSubmit={(e) => { e.preventDefault();
      m.mutate({ data: { title: f.title.trim(), author: f.author.trim(), edition: f.edition.trim(), publisher: f.publisher.trim() || null, version: f.version.trim(), legalAuthorization: f.legalAuthorization, authorizationReference: f.authorizationReference.trim() } },
        { onSuccess: () => { qc.invalidateQueries({ queryKey: getListScholarlySourcesQueryKey() }); qc.invalidateQueries({ queryKey: getListScholarlyAuditQueryKey() }); toast({ title: 'أُنشئ إصدار المصدر كمسودة' }); setF({ ...f, title: '', author: '', edition: '', publisher: '', version: '', authorizationReference: '' }); }, onError: () => toast({ title: 'تعذّر الإنشاء', variant: 'destructive' }) }); }}>
      <Field label="عنوان الكتاب"><input className={field} maxLength={500} value={f.title} onChange={set('title')} data-testid="input-source-title" /></Field>
      <Field label="المؤلف"><input className={field} maxLength={300} value={f.author} onChange={set('author')} data-testid="input-source-author" /></Field>
      <Field label="الطبعة"><input className={field} maxLength={300} value={f.edition} onChange={set('edition')} data-testid="input-source-edition" /></Field>
      <Field label="الناشر (اختياري)"><input className={field} maxLength={300} value={f.publisher} onChange={set('publisher')} data-testid="input-source-publisher" /></Field>
      <Field label="رقم الإصدار"><input className={field} maxLength={100} value={f.version} onChange={set('version')} data-testid="input-source-version" /></Field>
      <Field label="الترخيص القانوني"><select className={field} value={f.legalAuthorization} onChange={set('legalAuthorization')} data-testid="select-source-legal"><option value="public_domain">ملك عام</option><option value="licensed">مرخّص</option><option value="permission_granted">إذن خاص</option></select></Field>
      <div className="md:col-span-2"><Field label="مرجع التفويض"><textarea className={field} rows={2} maxLength={1000} value={f.authorizationReference} onChange={set('authorizationReference')} data-testid="input-source-authref" /></Field></div>
      <div className="md:col-span-2"><button className={btnPrimary} disabled={!ok || m.isPending} data-testid="button-create-source">إنشاء إصدار</button></div>
    </form>
  );
}

function PassageReview({ sourceId }: { sourceId: string }) {
  const q = useListScholarlyPassages(sourceId, { query: { queryKey: getListScholarlyPassagesQueryKey(sourceId) } });
  if (q.isLoading) return <LoadingList rows={1} />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  return <div className="mt-4 max-h-[32rem] space-y-4 overflow-y-auto rounded-xl border p-4">
    {!q.data?.length && <p>لا مقاطع للمراجعة بعد.</p>}
    {q.data?.map((p) => <article key={p.id} className="border-b pb-4">
      <p className="font-ui text-xs text-muted-foreground">
        المجلد: {p.volume ?? 'غير محدد'} · الصفحة المطبوعة: {p.printedPage ?? 'غير محددة'} · صفحة PDF: {p.pdfPage ?? 'غير محددة'}
      </p>
      <p className="mt-2 whitespace-pre-wrap font-arabic text-lg leading-loose">{p.text}</p>
    </article>)}
  </div>;
}

function SourceCard({ s }: { s: ScholarlySource }) {
  const qc = useQueryClient(); const { toast } = useToast();
   const [mode, setMode] = useState<'' | 'passages' | 'review' | 'withdraw' | 'inspect'>('');
  const [text, setText] = useState(''); const [volume, setVolume] = useState(''); const [printed, setPrinted] = useState(''); const [pdf, setPdf] = useState('');
  const [note, setNote] = useState('');
  const addP = useCreateScholarlyPassage(); const rev = useReviewScholarlySource(); const wd = useWithdrawScholarlySource();
  const index = useIndexScholarlySource();
  const refresh = () => { qc.invalidateQueries({ queryKey: getListScholarlySourcesQueryKey() }); qc.invalidateQueries({ queryKey: getListScholarlyAuditQueryKey() }); qc.invalidateQueries({ queryKey: getGetScholarlyConfigQueryKey() }); setMode(''); setNote(''); };
  const err = () => toast({ title: 'تعذّر تنفيذ الإجراء', variant: 'destructive' });
  const num = (v: string) => (v.trim() ? Math.max(1, Math.floor(Number(v))) : null);
  return (
    <article className="paper-card p-6" data-testid={`card-source-${s.id}`}>
      <div className="flex justify-between gap-3"><StatusPill status={s.status} /><span className="font-ui text-xs text-muted-foreground">الإصدار {s.version} · {s.passageCount.toLocaleString('ar-EG')} مقطع</span></div>
      <h3 className="mt-2 font-display text-lg font-bold">{s.title}</h3>
      <p className="font-ui text-sm text-muted-foreground">{s.author} · {s.edition}{s.publisher && ` · ${s.publisher}`}</p>
      <p className="mt-1 font-ui text-xs">الترخيص: {s.legalAuthorization} — {s.authorizationReference}</p>
      <p className="font-ui text-xs text-muted-foreground">المراجعة: {s.reviewedAt ? fmtDate(s.reviewedAt) : 'لم تتم'} · الفهرسة: {s.indexedAt ? fmtDate(s.indexedAt) : 'لم تتم'}</p>
      <button className={`${btnGhost} mt-3`} onClick={() => setMode(mode === 'inspect' ? '' : 'inspect')} data-testid={`button-inspect-${s.id}`}>قراءة المقاطع والصفحات</button>
      {(mode === 'inspect' || mode === 'review') && <PassageReview sourceId={s.id} />}
      {s.status !== 'withdrawn' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {s.status === 'draft' && <button className={btnGhost} onClick={() => setMode('passages')} data-testid={`button-passages-${s.id}`}>إضافة مقاطع</button>}
          {s.status === 'draft' && <button className={btnGhost} onClick={() => setMode('review')} data-testid={`button-review-${s.id}`}>مراجعة</button>}
          {s.status === 'reviewed' && <button className={btnPrimary} disabled={index.isPending} onClick={() => index.mutate({ sourceId: s.id, data: { confirmReviewed: true } }, { onSuccess: refresh, onError: err })} data-testid={`button-index-${s.id}`}>فهرسة الإصدار المراجَع</button>}
          <button className={btnGhost} onClick={() => setMode('withdraw')} data-testid={`button-withdraw-${s.id}`}>سحب</button>
        </div>
      )}
      {mode === 'passages' && (
        <div className="mt-4 space-y-3 rounded-2xl bg-background p-4">
          <Field label="نص المقطع"><textarea className={`${field} font-arabic`} rows={4} maxLength={12000} value={text} onChange={(e) => setText(e.target.value)} data-testid="input-passage-text" /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="المجلد"><input className={field} type="number" min={1} value={volume} onChange={(e) => setVolume(e.target.value)} data-testid="input-passage-volume" /></Field>
            <Field label="الصفحة المطبوعة"><input className={field} maxLength={50} value={printed} onChange={(e) => setPrinted(e.target.value)} data-testid="input-passage-printed" /></Field>
            <Field label="صفحة PDF"><input className={field} type="number" min={1} value={pdf} onChange={(e) => setPdf(e.target.value)} data-testid="input-passage-pdf" /></Field>
          </div>
          <button className={btnPrimary} disabled={!text.trim() || addP.isPending} data-testid="button-save-passage" onClick={() => addP.mutate({ sourceId: s.id, data: { passages: [{ text: text.trim(), volume: num(volume), printedPage: printed.trim() || null, pdfPage: num(pdf) }] } }, { onSuccess: () => { setText(''); setVolume(''); setPrinted(''); setPdf(''); refresh(); toast({ title: 'حُفظ المقطع للمراجعة' }); }, onError: err })}>حفظ المقطع</button>
        </div>
      )}
      {(mode === 'review' || mode === 'withdraw') && (
        <div className="mt-4 space-y-3 rounded-2xl bg-background p-4">
           <p className="font-ui text-sm text-muted-foreground">{mode === 'review' ? 'تحقق من نص كل مقطع وأرقام الصفحات وحقوق هذه الطبعة قبل الاعتماد.' : 'السحب يستبعد المصدر من الإجابات الجديدة ويلغي صلاحية تقييم المجموعة الحالية. تبقى الاستشهادات السابقة محفوظة للمراجعة.'}</p>
          <Field label={mode === 'review' ? 'ملاحظة المراجعة' : 'سبب السحب'}><textarea className={field} rows={2} minLength={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} data-testid="input-reason" /></Field>
          <div className="flex gap-2">
            {mode === 'review' ? (<>
              <button className={btnPrimary} disabled={note.trim().length < 3 || rev.isPending} data-testid="button-approve" onClick={() => rev.mutate({ sourceId: s.id, data: { decision: 'approve', note: note.trim() } }, { onSuccess: refresh, onError: err })}>اعتماد المراجعة</button>
              <button className={btnGhost} disabled={note.trim().length < 3 || rev.isPending} data-testid="button-reject" onClick={() => rev.mutate({ sourceId: s.id, data: { decision: 'reject', note: note.trim() } }, { onSuccess: refresh, onError: err })}>رفض</button>
            </>) : <button className={btnPrimary} disabled={note.trim().length < 3 || wd.isPending} data-testid="button-confirm-withdraw" onClick={() => wd.mutate({ sourceId: s.id, data: { reason: note.trim() } }, { onSuccess: refresh, onError: err })}>تأكيد السحب</button>}
            <button className={btnGhost} onClick={() => setMode('')}>إلغاء</button>
          </div>
        </div>
      )}
    </article>
  );
}

function Sources() {
  const q = useListScholarlySources({ query: { queryKey: getListScholarlySourcesQueryKey() } });
  if (q.isLoading) return <LoadingList />;
  if (forbidden(q.error)) return <Denied />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  return (
    <div className="space-y-6"><SourceForm />
      {!q.data?.length ? <EmptyState title="لا مصادر بعد">لم يُضَف أي كتاب. بلا مصادر مراجَعة لن يجيب المساعد.</EmptyState> : <div className="space-y-4">{q.data.map((s) => <SourceCard key={s.id} s={s} />)}</div>}
    </div>
  );
}

function Config() {
  const qc = useQueryClient(); const { toast } = useToast();
  const q = useGetScholarlyConfig({ query: { queryKey: getGetScholarlyConfigQueryKey() } });
  const upd = useUpdateScholarlyConfig(); const ev = useRecordScholarlyEvaluation();
  const [a, setA] = useState(false); const [g, setG] = useState(false); const [b, setB] = useState(false); const [note, setNote] = useState('');
  const [model, setModel] = useState<'gpt-5.4-mini' | 'gpt-5.4' | ''>('');
  if (q.isLoading) return <LoadingList rows={1} />;
  if (forbidden(q.error)) return <Denied />;
  if (q.isError || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  const c = q.data;
  const done = () => { qc.invalidateQueries({ queryKey: getGetScholarlyConfigQueryKey() }); qc.invalidateQueries({ queryKey: getListScholarlyAuditQueryKey() }); };
  return (
    <div className="space-y-6">
      <section className="paper-card p-6" data-testid="card-config">
        <ul className="grid gap-2 font-ui text-sm sm:grid-cols-2"><li>النموذج: {c.model}</li><li>المزوّد: {c.providerConfigured ? 'مهيّأ' : 'غير مهيّأ'}</li><li>التقييم: {c.evaluationPassed ? 'اجتاز' : 'لم يجتز'}</li><li>مصادر مراجَعة: {c.reviewedSourceCount.toLocaleString('ar-EG')}</li><li data-testid="text-enabled">المساعد: {c.assistantEnabled ? 'مفعّل' : 'غير مفعّل'}</li></ul>
        <div className="mt-4 space-y-3"><Field label="النموذج المراد تقييمه">
          <select className={field} value={model || c.model} onChange={(e) => setModel(e.target.value as 'gpt-5.4-mini' | 'gpt-5.4')} data-testid="select-model"><option value="gpt-5.4-mini">gpt-5.4-mini</option><option value="gpt-5.4">gpt-5.4</option></select>
        </Field><p className="font-ui text-sm text-muted-foreground">تغيير النموذج يوقف الإجابات حتى يُعاد تقييمه على المجموعة الحالية.</p>
        <button className={btnGhost} disabled={upd.isPending} data-testid="button-pin-model" onClick={() => upd.mutate({ data: { model: model || c.model } }, { onSuccess: () => { done(); toast({ title: 'ثُبّت النموذج؛ راجع التقييم قبل تشغيله' }); }, onError: () => toast({ title: 'تعذّر التحديث', variant: 'destructive' }) })}>حفظ النموذج</button></div>
      </section>
      <section className="paper-card space-y-3 p-6">
        <h3 className="font-display text-lg font-bold">تشغيل التقييم وتسجيل المراجعة</h3>
        <p className="font-ui text-sm text-muted-foreground">تُشغّل اختبارات الاسترجاع والاستشهاد والامتناع على الخادم والمصادر المفهرسة. هذه الموافقات البشرية لا تكفي وحدها للتفعيل.</p>
        {([['جودة العربية', a, setA, 'arabic'], ['الاستناد إلى المصادر', g, setG, 'grounding'], ['الامتناع عند قصور المصدر', b, setB, 'abstention']] as const).map(([l, v, set, id]) => <label key={id} className="flex items-center gap-3 font-ui text-sm"><input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} data-testid={`checkbox-eval-${id}`} />{l}</label>)}
        <Field label="ملاحظة التقييم"><textarea className={field} rows={2} minLength={3} maxLength={3000} value={note} onChange={(e) => setNote(e.target.value)} data-testid="input-eval-note" /></Field>
        <button className={btnPrimary} disabled={note.trim().length < 3 || ev.isPending || !c.providerConfigured || c.reviewedSourceCount === 0} data-testid="button-record-eval" onClick={() => ev.mutate({ data: { model: c.model, arabicQualityPassed: a, groundingPassed: g, abstentionPassed: b, note: note.trim() } }, { onSuccess: () => { done(); setNote(''); toast({ title: 'سُجّلت نتيجة التقييم؛ راجع حالة الاجتياز' }); }, onError: () => toast({ title: 'تعذّر تشغيل التقييم', variant: 'destructive' }) })}>{ev.isPending ? 'جارٍ التقييم على الخادم…' : 'تشغيل وتسجيل'}</button>
      </section>
    </div>
  );
}

function Issues() {
  const qc = useQueryClient(); const { toast } = useToast();
  const [status, setStatus] = useState<'open' | 'reviewed' | 'resolved' | undefined>('open');
  const params = status ? { status } : undefined;
  const q = useListScholarlyIssues(params, { query: { queryKey: getListScholarlyIssuesQueryKey(params) } });
  const mod = useModerateScholarlyIssue();
  const [notes, setNotes] = useState<Record<string, string>>({});
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">{([['open', 'مفتوحة'], ['reviewed', 'قيد المراجعة'], ['resolved', 'محلولة'], [undefined, 'الكل']] as const).map(([s, l]) => <button key={l} className={status === s ? btnPrimary : btnGhost} onClick={() => setStatus(s)} data-testid={`filter-issue-${s ?? 'all'}`}>{l}</button>)}</div>
      {q.isLoading ? <LoadingList /> : forbidden(q.error) ? <Denied /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title="لا بلاغات">لا بلاغات بهذه الحالة.</EmptyState> : (
        <div className="space-y-4">{q.data.map((i) => {
          const n = (notes[i.id] ?? '').trim();
          const go = (st: 'reviewed' | 'resolved') => mod.mutate({ issueId: i.id, data: { status: st, note: n } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListScholarlyIssuesQueryKey() }); qc.invalidateQueries({ queryKey: getListScholarlyAuditQueryKey() }); }, onError: () => toast({ title: 'تعذّر الحفظ', variant: 'destructive' }) });
          return (
            <article key={i.id} className="paper-card p-6" data-testid={`card-issue-${i.id}`}>
              <div className="flex justify-between"><StatusPill status={i.status} /><span className="font-ui text-xs text-muted-foreground">{i.category} · {fmtDate(i.createdAt)}</span></div>
              <p className="mt-3 font-arabic text-lg leading-loose">{i.description}</p>
              <details className="mt-3 rounded-xl border p-3"><summary className="cursor-pointer font-ui text-sm font-bold">السؤال والإجابة محل البلاغ</summary><p className="mt-3 whitespace-pre-wrap font-arabic">{i.question}</p><p className="mt-2 whitespace-pre-wrap font-arabic">{i.answer ?? 'لم تُولّد إجابة.'}</p><CitationList citations={i.citations} /></details>
              {i.moderationNote && <p className="font-ui text-sm text-muted-foreground">ملاحظة: {i.moderationNote}</p>}
              {i.status !== 'resolved' && <div className="mt-3 space-y-2"><textarea className={field} rows={2} maxLength={2000} placeholder="ملاحظة الإشراف" value={notes[i.id] ?? ''} onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })} data-testid={`input-note-${i.id}`} />
                <div className="flex gap-2">{i.status === 'open' && <button className={btnGhost} disabled={n.length < 3 || mod.isPending} onClick={() => go('reviewed')} data-testid={`button-reviewed-${i.id}`}>قيد المراجعة</button>}<button className={btnPrimary} disabled={n.length < 3 || mod.isPending} onClick={() => go('resolved')} data-testid={`button-resolve-${i.id}`}>حلّ</button></div></div>}
            </article>
          );
        })}</div>
      )}
    </div>
  );
}

function Audit() {
  const q = useListScholarlyAudit({ query: { queryKey: getListScholarlyAuditQueryKey() } });
  if (q.isLoading) return <LoadingList />;
  if (forbidden(q.error)) return <Denied />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <EmptyState title="لا سجل بعد">ستظهر هنا القرارات الحساسة مع فاعلها وسببها.</EmptyState>;
  return <ul className="space-y-3">{q.data.map((e) => <li key={e.id} className="paper-card p-4 font-ui text-sm" data-testid={`row-audit-${e.id}`}><b>{e.action}</b> · {e.targetType}{e.targetId && ` (${e.targetId})`}<span className="block text-muted-foreground">{e.reason} — {e.actorId} — {fmtDate(e.createdAt)}</span></li>)}</ul>;
}

const TABS = [['sources', 'المصادر', Sources], ['config', 'المساعد والتقييم', Config], ['issues', 'البلاغات', Issues], ['audit', 'السجل', Audit]] as const;

function AdminScholarlyInner() {
  usePageMeta('إدارة المصادر العلمية | مَتِين', 'مصادر المساعد، تقييمه، البلاغات وسجل القرارات.');
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('sources');
  const Active = TABS.find((t) => t[0] === tab)![2];
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader eyebrow="الإدارة" title="المصادر العلمية">لا يُفهرس مصدر قبل مراجعته وتوثيق ترخيصه، ولا يُفعَّل المساعد قبل اجتياز التقييم.</PageHeader>
      <div className="mb-6 flex flex-wrap gap-2" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? btnPrimary : btnGhost} onClick={() => setTab(k)} data-testid={`tab-${k}`}>{l}</button>)}</div>
      <Active />
      <Link href="/student" className="mt-8 inline-block font-ui text-sm font-bold text-secondary" data-testid="link-back-student">العودة إلى مساحة الطالب</Link>
    </div>
  );
}

export default function AdminScholarlyPage() {
  return <AdminGate need="content">{() => <AdminScholarlyInner />}</AdminGate>;
}
