import { intlTag } from '@/lib/i18n';
import { tr } from '@/lib/i18n';
import { useState } from 'react';
import PrivatePreview from '@/components/scholarly/PrivatePreview';
import PreparedSourceImport from '@/components/scholarly/PreparedSourceImport';
import { useQueryClient } from '@tanstack/react-query';
import { getGetScholarlyConfigQueryKey, getListScholarlyAuditQueryKey, getListScholarlyIssuesQueryKey, getListScholarlySourcesQueryKey, useCreateScholarlyPassage, useCreateScholarlySource, useGetScholarlyConfig, useListScholarlyAudit, useListScholarlyIssues, useListScholarlySources, useModerateScholarlyIssue, useRecordScholarlyEvaluation, useReviewScholarlySource, useUpdateScholarlyConfig, useWithdrawScholarlySource } from '@workspace/api-client-react';
import type { ScholarlySource } from '@workspace/api-client-react';
import { EmptyState, ErrorState, LoadingList, PageHeader } from '@/components/mateen/bits';
import { getListScholarlyPassagesQueryKey, useListScholarlyPassages } from '@workspace/api-client-react';
import { useIndexScholarlySource } from '@workspace/api-client-react';
import { getGetScholarlyCollationQueryKey, useGetScholarlyCollation } from '@workspace/api-client-react';
import CollationReview from '@/components/scholarly/CollationReview';
import { CitationList } from '@/components/scholarly/shared';
import { Field, StatusPill, btnGhost, btnPrimary, field } from '@/components/scholarly/shared';
import { Link } from 'wouter';
import { AdminGate } from '@/components/admin/AdminGate';
import { fmtDate, usePageMeta } from '@/lib/mateen';
import { useToast } from '@/hooks/use-toast';

const forbidden = (e: unknown) => (e as { status?: number } | null)?.status === 403 || (e as { status?: number } | null)?.status === 401;

function Denied() {
  return <EmptyState title={tr("لا صلاحية لك هنا")}>{tr("هذه الصفحة لإدارة المصادر العلمية، والخادم لم يمنحك الإذن بالدخول إليها.")}</EmptyState>;
}

function SourceForm() {
  const qc = useQueryClient(); const { toast } = useToast(); const m = useCreateScholarlySource();
  const [f, setF] = useState({ title: '', author: '', edition: '', publisher: '', version: '', legalAuthorization: 'public_domain' as 'public_domain' | 'licensed' | 'permission_granted', authorizationReference: '' });
  const [textId, setTextId] = useState<'nawawi' | 'tuhfa' | 'usul-thalatha' | ''>('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const ok = f.title.trim() && f.author.trim() && f.edition.trim() && f.version.trim() && f.authorizationReference.trim();
  return (
    <form className="paper-card grid gap-4 p-6 md:grid-cols-2" data-testid="form-source" onSubmit={(e) => { e.preventDefault();
      m.mutate({ data: { textId: textId || null, title: f.title.trim(), author: f.author.trim(), edition: f.edition.trim(), publisher: f.publisher.trim() || null, version: f.version.trim(), legalAuthorization: f.legalAuthorization, authorizationReference: f.authorizationReference.trim() } },
        { onSuccess: () => { qc.invalidateQueries({ queryKey: getListScholarlySourcesQueryKey() }); qc.invalidateQueries({ queryKey: getListScholarlyAuditQueryKey() }); toast({ title: tr("أُنشئ إصدار المصدر كمسودة") }); setF({ ...f, title: '', author: '', edition: '', publisher: '', version: '', authorizationReference: '' }); }, onError: () => toast({ title: tr("تعذّر الإنشاء"), variant: 'destructive' }) }); }}>
      <Field label={tr("عنوان الكتاب")}><input className={field} maxLength={500} value={f.title} onChange={set('title')} data-testid="input-source-title" /></Field>
      <Field label={tr("المؤلف")}><input className={field} maxLength={300} value={f.author} onChange={set('author')} data-testid="input-source-author" /></Field>
      <Field label={tr("الطبعة")}><input className={field} maxLength={300} value={f.edition} onChange={set('edition')} data-testid="input-source-edition" /></Field>
      <Field label={tr("الناشر (اختياري)")}><input className={field} maxLength={300} value={f.publisher} onChange={set('publisher')} data-testid="input-source-publisher" /></Field>
      <Field label={tr("رقم الإصدار")}><input className={field} maxLength={100} value={f.version} onChange={set('version')} data-testid="input-source-version" /></Field>
      <Field label={tr("الترخيص القانوني")}><select className={field} value={f.legalAuthorization} onChange={set('legalAuthorization')} data-testid="select-source-legal"><option value="public_domain">{tr("ملك عام")}</option><option value="licensed">{tr("مرخّص")}</option><option value="permission_granted">{tr("إذن خاص")}</option></select></Field>
      <Field label={tr("نطاق المتن لهذا الإصدار")} hint={tr("يُراجع مع المصدر ولا يتغير بعد الاعتماد؛ المصدر غير المحدد لا يُستخدم في إجابات الطلاب.")}>
        <select className={field} value={textId} onChange={e => setTextId(e.target.value as typeof textId)} data-testid="select-source-book">
          <option value="">{tr("غير محدد")}</option><option value="nawawi">{tr("الأربعون النووية")}</option><option value="tuhfa">{tr("تحفة الأطفال")}</option><option value="usul-thalatha">{tr("الأصول الثلاثة")}</option>
        </select>
      </Field>
      <div className="md:col-span-2"><Field label={tr("مرجع التفويض")}><textarea className={field} rows={2} maxLength={1000} value={f.authorizationReference} onChange={set('authorizationReference')} data-testid="input-source-authref" /></Field></div>
      <div className="md:col-span-2"><button className={btnPrimary} disabled={!ok || m.isPending} data-testid="button-create-source">{tr("إنشاء إصدار")}</button></div>
    </form>
  );
}

function PassageReview({ sourceId }: { sourceId: string }) {
  const q = useListScholarlyPassages(sourceId, { query: { queryKey: getListScholarlyPassagesQueryKey(sourceId) } });
  const col = useGetScholarlyCollation(sourceId, { query: { queryKey: getGetScholarlyCollationQueryKey(sourceId), staleTime: 0, refetchInterval: 60_000 } });
  const byPassage = new Map((col.data ?? []).map((c) => [c.passageId, c]));
  if (q.isLoading) return <LoadingList rows={1} />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  return <div className="mt-4 max-h-[32rem] space-y-4 overflow-y-auto rounded-xl border p-4">
    {!q.data?.length && <p>{tr("لا مقاطع للمراجعة بعد.")}</p>}
    {q.data?.map((p) => <article key={p.id} className="border-b pb-4">
      <p className="font-ui text-xs text-muted-foreground">{tr("المجلد:")}{' '}{p.volume ?? tr("غير محدد")}{' '}{tr("· الصفحة المطبوعة:")}{' '}{p.printedPage ?? tr("غير محددة")}{' '}{tr("· صفحة PDF:")}{' '}{p.pdfPage ?? tr("غير محددة")}
      </p>
      {p.sourceUrl && <a className="font-ui text-sm underline" href={p.sourceUrl} target="_blank" rel="noreferrer">{tr("أصل المقطع — صفحة الموقع")}{' '}{p.viewerPage?.toLocaleString(intlTag())}{' '}{tr("(ليست صفحة مطبوعة أو PDF)")}</a>}
      <p className="mt-2 whitespace-pre-wrap font-arabic text-lg leading-loose">{p.text}</p>
      {col.isLoading ? <div className="skel mt-2 h-16" aria-busy="true" /> : col.isError
        ? <div className="mt-2 rounded-xl border p-3 font-ui text-sm" data-testid={`error-collation-${p.id}`}>{forbidden(col.error) ? tr("لا صلاحية لعرض المقارنة.") : tr("تعذّر تحميل المقارنة المحلية.")} {!forbidden(col.error) && <button type="button" className={btnGhost} onClick={() => col.refetch()}>{tr("إعادة المحاولة")}</button>}</div>
        : <CollationReview sourceId={sourceId} entry={byPassage.get(p.id)} />}
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
  const err = () => toast({ title: tr("تعذّر تنفيذ الإجراء"), variant: 'destructive' });
  const num = (v: string) => (v.trim() ? Math.max(1, Math.floor(Number(v))) : null);
  return (
    <article id={`source-${s.id}`} className="paper-card p-6" data-testid={`card-source-${s.id}`}>
      <div className="flex justify-between gap-3"><StatusPill status={s.status} /><span className="font-ui text-xs text-muted-foreground">{tr("الإصدار")}{' '}{s.version} · {s.passageCount.toLocaleString(intlTag())}{' '}{tr("مقطع")}</span></div>
      <h3 className="mt-2 font-display text-lg font-bold">{s.title}</h3>
      <p className="font-ui text-sm text-muted-foreground">{s.author} · {s.edition}{s.publisher && ` · ${s.publisher}`}</p>
      <p className="mt-1 font-ui text-xs">{tr("الترخيص:")}{' '}{s.legalAuthorization} — {s.authorizationReference}</p>
      <p className="mt-1 font-ui text-xs">{tr("نطاق المتن:")}{' '}{s.textId === 'nawawi' ? tr("الأربعون النووية") : s.textId === 'tuhfa' ? tr("تحفة الأطفال") : s.textId === 'usul-thalatha' ? tr("الأصول الثلاثة") : tr("غير محدد — غير متاح لإجابات الطلاب")}</p>
      <p className="font-ui text-xs text-muted-foreground">{tr("المراجعة:")}{' '}{s.reviewedAt ? fmtDate(s.reviewedAt) : tr("لم تتم")}{' '}{tr("· الفهرسة:")}{' '}{s.indexedAt ? fmtDate(s.indexedAt) : tr("لم تتم")}</p>
      <button className={`${btnGhost} mt-3`} onClick={() => setMode(mode === 'inspect' ? '' : 'inspect')} data-testid={`button-inspect-${s.id}`}>{tr("قراءة المقاطع والصفحات")}</button>
      {(mode === 'inspect' || mode === 'review') && <PassageReview sourceId={s.id} />}
      {s.status !== 'withdrawn' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {s.status === 'draft' && <button className={btnGhost} onClick={() => setMode('passages')} data-testid={`button-passages-${s.id}`}>{tr("إضافة مقاطع")}</button>}
          {s.status === 'draft' && <button className={btnGhost} onClick={() => setMode('review')} data-testid={`button-review-${s.id}`}>{tr("مراجعة")}</button>}
          {s.status === 'reviewed' && <button className={btnPrimary} disabled={index.isPending} onClick={() => index.mutate({ sourceId: s.id, data: { confirmReviewed: true } }, { onSuccess: refresh, onError: err })} data-testid={`button-index-${s.id}`}>{tr("فهرسة الإصدار المراجَع")}</button>}
          <button className={btnGhost} onClick={() => setMode('withdraw')} data-testid={`button-withdraw-${s.id}`}>{tr("سحب")}</button>
        </div>
      )}
      {mode === 'passages' && (
        <div className="mt-4 space-y-3 rounded-2xl bg-background p-4">
          <Field label={tr("نص المقطع")}><textarea className={`${field} font-arabic`} rows={4} maxLength={12000} value={text} onChange={(e) => setText(e.target.value)} data-testid="input-passage-text" /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={tr("المجلد")}><input className={field} type="number" min={1} value={volume} onChange={(e) => setVolume(e.target.value)} data-testid="input-passage-volume" /></Field>
            <Field label={tr("الصفحة المطبوعة")}><input className={field} maxLength={50} value={printed} onChange={(e) => setPrinted(e.target.value)} data-testid="input-passage-printed" /></Field>
            <Field label={tr("صفحة PDF")}><input className={field} type="number" min={1} value={pdf} onChange={(e) => setPdf(e.target.value)} data-testid="input-passage-pdf" /></Field>
          </div>
          <button className={btnPrimary} disabled={!text.trim() || addP.isPending} data-testid="button-save-passage" onClick={() => addP.mutate({ sourceId: s.id, data: { passages: [{ text: text.trim(), volume: num(volume), printedPage: printed.trim() || null, pdfPage: num(pdf) }] } }, { onSuccess: () => { setText(''); setVolume(''); setPrinted(''); setPdf(''); refresh(); toast({ title: tr("حُفظ المقطع للمراجعة") }); }, onError: err })}>{tr("حفظ المقطع")}</button>
        </div>
      )}
      {(mode === 'review' || mode === 'withdraw') && (
        <div className="mt-4 space-y-3 rounded-2xl bg-background p-4">
           <p className="font-ui text-sm text-muted-foreground">{mode === 'review' ? tr("تحقق من نص كل مقطع وأرقام الصفحات وحقوق هذه الطبعة قبل الاعتماد.") : tr("السحب يستبعد المصدر من الإجابات الجديدة ويلغي صلاحية تقييم المجموعة الحالية. تبقى الاستشهادات السابقة محفوظة للمراجعة.")}</p>
          <Field label={mode === 'review' ? tr("ملاحظة المراجعة") : tr("سبب السحب")}><textarea className={field} rows={2} minLength={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} data-testid="input-reason" /></Field>
          <div className="flex gap-2">
            {mode === 'review' ? (<>
              <button className={btnPrimary} disabled={note.trim().length < 3 || rev.isPending} data-testid="button-approve" onClick={() => rev.mutate({ sourceId: s.id, data: { decision: 'approve', note: note.trim() } }, { onSuccess: refresh, onError: err })}>{tr("اعتماد المراجعة")}</button>
              <button className={btnGhost} disabled={note.trim().length < 3 || rev.isPending} data-testid="button-reject" onClick={() => rev.mutate({ sourceId: s.id, data: { decision: 'reject', note: note.trim() } }, { onSuccess: refresh, onError: err })}>{tr("رفض")}</button>
            </>) : <button className={btnPrimary} disabled={note.trim().length < 3 || wd.isPending} data-testid="button-confirm-withdraw" onClick={() => wd.mutate({ sourceId: s.id, data: { reason: note.trim() } }, { onSuccess: refresh, onError: err })}>{tr("تأكيد السحب")}</button>}
            <button className={btnGhost} onClick={() => setMode('')}>{tr("إلغاء")}</button>
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
    <div className="space-y-6"><PreparedSourceImport /><SourceForm />
      {!q.data?.length ? <EmptyState title={tr("لا مصادر بعد")}>{tr("لم يُضَف أي كتاب. بلا مصادر مراجَعة لن يجيب المساعد.")}</EmptyState> : <div className="space-y-4">{q.data.map((s) => <SourceCard key={s.id} s={s} />)}</div>}
    </div>
  );
}

function Config() {
  const qc = useQueryClient(); const { toast } = useToast();
  const q = useGetScholarlyConfig({ query: { queryKey: getGetScholarlyConfigQueryKey() } });
  const upd = useUpdateScholarlyConfig(); const ev = useRecordScholarlyEvaluation();
  const [a, setA] = useState(false); const [g, setG] = useState(false); const [b, setB] = useState(false); const [note, setNote] = useState('');
  const [model, setModel] = useState<NonNullable<typeof q.data>['model'] | ''>('');
  if (q.isLoading) return <LoadingList rows={1} />;
  if (forbidden(q.error)) return <Denied />;
  if (q.isError || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  const c = q.data;
  const done = () => { qc.invalidateQueries({ queryKey: getGetScholarlyConfigQueryKey() }); qc.invalidateQueries({ queryKey: getListScholarlyAuditQueryKey() }); };
  return (
    <div className="space-y-6">
      <section className="paper-card p-6" data-testid="card-config">
        <ul className="grid gap-2 font-ui text-sm sm:grid-cols-2"><li>{tr("النموذج:")}{' '}{c.model}</li><li>{tr("المزوّد:")}{' '}{c.providerConfigured ? tr("مهيّأ") : tr("غير مهيّأ")}</li><li>{tr("التقييم:")}{' '}{c.evaluationPassed ? tr("اجتاز") : tr("لم يجتز")}</li><li>{tr("مصادر مراجَعة:")}{' '}{c.reviewedSourceCount.toLocaleString(intlTag())}</li><li data-testid="text-enabled">{tr("المساعد:")}{' '}{c.assistantEnabled ? tr("مفعّل") : tr("غير مفعّل")}</li></ul>
        <div className="mt-4 space-y-3"><Field label={tr("النموذج المراد تقييمه")}>
          <select className={field} value={model || c.model} onChange={(e) => setModel(e.target.value as typeof c.model)} data-testid="select-model"><option value="google/gemini-2.5-flash">OpenRouter — Gemini 2.5 Flash</option><option value="nvidia/nemotron-3.5-lightning-30b-a3b">NVIDIA Nemotron 3.5 Lightning</option><option value="gpt-5.4-mini">gpt-5.4-mini</option><option value="gpt-5.4">gpt-5.4</option></select>
        </Field><p className="font-ui text-sm text-muted-foreground">{tr("تغيير النموذج يوقف الإجابات حتى يُعاد تقييمه على المجموعة الحالية.")}</p>
        <button className={btnGhost} disabled={upd.isPending} data-testid="button-pin-model" onClick={() => upd.mutate({ data: { model: model || c.model } }, { onSuccess: () => { done(); toast({ title: tr("ثُبّت النموذج؛ راجع التقييم قبل تشغيله") }); }, onError: () => toast({ title: tr("تعذّر التحديث"), variant: 'destructive' }) })}>{tr("حفظ النموذج")}</button></div>
      </section>
      <section className="paper-card space-y-3 p-6">
        <h3 className="font-display text-lg font-bold">{tr("تشغيل التقييم وتسجيل المراجعة")}</h3>
        <p className="font-ui text-sm text-muted-foreground">{tr("تُشغّل اختبارات الاسترجاع والاستشهاد والامتناع على الخادم والمصادر المفهرسة. هذه الموافقات البشرية لا تكفي وحدها للتفعيل.")}</p>
        {([[tr("جودة العربية"), a, setA, 'arabic'], [tr("الاستناد إلى المصادر"), g, setG, 'grounding'], [tr("الامتناع عند قصور المصدر"), b, setB, 'abstention']] as const).map(([l, v, set, id]) => <label key={id} className="flex items-center gap-3 font-ui text-sm"><input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} data-testid={`checkbox-eval-${id}`} />{l}</label>)}
        <Field label={tr("ملاحظة التقييم")}><textarea className={field} rows={2} minLength={3} maxLength={3000} value={note} onChange={(e) => setNote(e.target.value)} data-testid="input-eval-note" /></Field>
        <button className={btnPrimary} disabled={note.trim().length < 3 || ev.isPending || !c.providerConfigured || c.reviewedSourceCount === 0} data-testid="button-record-eval" onClick={() => ev.mutate({ data: { model: c.model, arabicQualityPassed: a, groundingPassed: g, abstentionPassed: b, note: note.trim() } }, { onSuccess: () => { done(); setNote(''); toast({ title: tr("سُجّلت نتيجة التقييم؛ راجع حالة الاجتياز") }); }, onError: () => toast({ title: tr("تعذّر تشغيل التقييم"), variant: 'destructive' }) })}>{ev.isPending ? tr("جارٍ التقييم على الخادم…") : tr("تشغيل وتسجيل")}</button>
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
      <div className="mb-4 flex flex-wrap gap-2">{([['open', tr("مفتوحة")], ['reviewed', tr("قيد المراجعة")], ['resolved', tr("محلولة")], [undefined, tr("الكل")]] as const).map(([s, l]) => <button key={l} className={status === s ? btnPrimary : btnGhost} onClick={() => setStatus(s)} data-testid={`filter-issue-${s ?? 'all'}`}>{l}</button>)}</div>
      {q.isLoading ? <LoadingList /> : forbidden(q.error) ? <Denied /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title={tr("لا بلاغات")}>{tr("لا بلاغات بهذه الحالة.")}</EmptyState> : (
        <div className="space-y-4">{q.data.map((i) => {
          const n = (notes[i.id] ?? '').trim();
          const go = (st: 'reviewed' | 'resolved') => mod.mutate({ issueId: i.id, data: { status: st, note: n } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListScholarlyIssuesQueryKey() }); qc.invalidateQueries({ queryKey: getListScholarlyAuditQueryKey() }); }, onError: () => toast({ title: tr("تعذّر الحفظ"), variant: 'destructive' }) });
          return (
            <article key={i.id} className="paper-card p-6" data-testid={`card-issue-${i.id}`}>
              <div className="flex justify-between"><StatusPill status={i.status} /><span className="font-ui text-xs text-muted-foreground">{i.category} · {fmtDate(i.createdAt)}</span></div>
              <p className="mt-3 font-arabic text-lg leading-loose">{i.description}</p>
              <details className="mt-3 rounded-xl border p-3"><summary className="cursor-pointer font-ui text-sm font-bold">{tr("السؤال والإجابة محل البلاغ")}</summary><p className="mt-3 whitespace-pre-wrap font-arabic">{i.question}</p><p className="mt-2 whitespace-pre-wrap font-arabic">{i.answer ?? tr("لم تُولّد إجابة.")}</p><CitationList citations={i.citations} /></details>
              {i.moderationNote && <p className="font-ui text-sm text-muted-foreground">{tr("ملاحظة:")}{' '}{i.moderationNote}</p>}
              {i.status !== 'resolved' && <div className="mt-3 space-y-2"><textarea className={field} rows={2} maxLength={2000} placeholder={tr("ملاحظة الإشراف")} value={notes[i.id] ?? ''} onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })} data-testid={`input-note-${i.id}`} />
                <div className="flex gap-2">{i.status === 'open' && <button className={btnGhost} disabled={n.length < 3 || mod.isPending} onClick={() => go('reviewed')} data-testid={`button-reviewed-${i.id}`}>{tr("قيد المراجعة")}</button>}<button className={btnPrimary} disabled={n.length < 3 || mod.isPending} onClick={() => go('resolved')} data-testid={`button-resolve-${i.id}`}>{tr("حلّ")}</button></div></div>}
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
  if (!q.data?.length) return <EmptyState title={tr("لا سجل بعد")}>{tr("ستظهر هنا القرارات الحساسة مع فاعلها وسببها.")}</EmptyState>;
  return <ul className="space-y-3">{q.data.map((e) => <li key={e.id} className="paper-card p-4 font-ui text-sm" data-testid={`row-audit-${e.id}`}><b>{e.action}</b> · {e.targetType}{e.targetId && ` (${e.targetId})`}<span className="block text-muted-foreground">{e.reason} — {e.actorId} — {fmtDate(e.createdAt)}</span></li>)}</ul>;
}

// i18n-keys: rendered through tr()
const TABS = [['sources', 'المصادر', Sources], ['config', 'المساعد والتقييم', Config], ['preview', 'تجربة خاصة', PrivatePreview], ['issues', 'البلاغات', Issues], ['audit', 'السجل', Audit]] as const;

function AdminScholarlyInner() {
  usePageMeta(tr("إدارة المصادر العلمية | مَتِين"), tr("مصادر المساعد، تقييمه، البلاغات وسجل القرارات."));
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('sources');
  const Active = TABS.find((t) => t[0] === tab)![2];
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader eyebrow={tr("الإدارة")} title={tr("المصادر العلمية")}>{tr("لا يُفهرس مصدر قبل مراجعته وتوثيق ترخيصه، ولا يُفعَّل المساعد قبل اجتياز التقييم.")}</PageHeader>
      <div className="mb-6 flex flex-wrap gap-2" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? btnPrimary : btnGhost} onClick={() => setTab(k)} data-testid={`tab-${k}`}>{tr(l)}</button>)}</div>
      <Active />
      <Link href="/student" className="mt-8 inline-block font-ui text-sm font-bold text-secondary" data-testid="link-back-student">{tr("العودة إلى مساحة الطالب")}</Link>
    </div>
  );
}

export default function AdminScholarlyPage() {
  return <AdminGate need="content">{() => <AdminScholarlyInner />}</AdminGate>;
}
