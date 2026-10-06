import { fmt } from '@/lib/i18n';
import { tr } from '@/lib/i18n';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetTeacherQueryKey, useCompleteQualificationUpload, useGetTeacher, useRemoveQualificationDocument,
  useRequestQualificationUpload, useSaveTeacher, useSubmitTeacherApplication,
} from '@workspace/api-client-react';
import type { QualificationUploadInput } from '@workspace/api-client-react';
import { Trash2, Upload } from 'lucide-react';
import { DocDownload, History, Pill, toneOf } from '@/components/admin/parts';
import DocPreview from '@/components/admin/DocPreview';
import { ErrorState, LoadingList, Notice, PageHeader } from '@/components/mateen/bits';
import { APP_STATUS, DOC_KIND, DOC_STATUS, errMsg, errStatus, fmtSize, invalidateReviewData } from '@/lib/admin';
import { fmtDate, num, usePageMeta } from '@/lib/mateen';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';

const DESC: Record<string, string> = {
  get draft() { return tr("ملفك محفوظ ولم يُرسل بعد. ارفع شهادة PDF تجتاز الفحص الأمني ثم أرسل الطلب."); },
  get pending_review() { return tr("طلبك قيد مراجعة المنصة. تُجمَّد النبذة والتخصصات والوثائق حتى صدور القرار."); },
  get approved() { return tr("اعتمدت المنصة ملفك. أي تعديل على الوثائق يُبطل الاعتماد في الخادم ويعيدك إلى المراجعة."); },
  get needs_information() { return tr("طلب المراجع معلومات إضافية. اقرأ السبب أدناه، عدّل ثم أعد الإرسال."); },
  get rejected() { return tr("رُفض الطلب. اقرأ السبب أدناه؛ يمكنك تعديل ملفك وإعادة الإرسال."); },
};
const MAX = 10485760;

export default function TeacherHome() {
  usePageMeta(tr("ملف المعلم | مَتِين"), tr("ملفك العلمي ووثائقك وحالة طلب الاعتماد."));
  const q = useGetTeacher({ query: { enabled: true, queryKey: getGetTeacherQueryKey(), refetchInterval: 30_000 } });
  const save = useSaveTeacher();
  const reqUp = useRequestQualificationUpload();
  const complete = useCompleteQualificationUpload();
  const remove = useRemoveQualificationDocument();
  const submitApp = useSubmitTeacherApplication();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [bio, setBio] = useState('');
  const [spec, setSpec] = useState('');
  const [avail, setAvail] = useState(false);
  const [kind, setKind] = useState<QualificationUploadInput['kind']>('qualification');
  const [upMsg, setUpMsg] = useState('');
  const [upBusy, setUpBusy] = useState(false);
  const [warn, setWarn] = useState<null | { label: string; run: () => void }>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inited = useRef(false);
  const lastAvailable = useRef<boolean | null>(null);
  useEffect(() => {
    if (q.data && !inited.current) { inited.current = true; setBio(q.data.biography); setSpec(q.data.specialties); setAvail(q.data.available); }
    if (q.data) {
      const previous = lastAvailable.current;
      setAvail((current) => previous === null || current === previous ? q.data!.available : current);
      lastAvailable.current = q.data.available;
    }
  }, [q.data]);

  if (q.isLoading) return <LoadingList />;
  if (q.isError || !q.data) {
    if (errStatus(q.error) === 403) return (
      <div className="space-y-4" data-testid="state-teacher-forbidden">
        <PageHeader eyebrow={tr("المعلم")} title={tr("أكمل التحقق من حسابك")} />
        <Notice tone="amber" title={tr("يلزم حساب معلم وبريد إلكتروني موثّق")}>
          {errMsg(q.error, tr("تحقق من بريدك الإلكتروني ومن اختيار دور المعلم في حسابك. المصادقة الثنائية ليست شرطاً لتقديم طلب المعلم."))}
        </Notice>
        <button onClick={() => q.refetch()} className="rounded-full bg-secondary px-6 py-2 font-ui text-sm font-bold text-secondary-foreground" data-testid="button-recheck-teacher">{tr("إعادة المحاولة بعد الدخول من جديد")}</button>
      </div>
    );
    return <ErrorState message={errMsg(q.error, tr("تعذّر تحميل ملفك."))} onRetry={() => q.refetch()} />;
  }
  const t = q.data;
  const status = t.status;
  const docs = t.documents ?? [];
  const locked = status === 'pending_review' || submitting;
  const cleanCount = docs.filter((d) => d.status === 'clean' && d.contentType === 'application/pdf').length;
  const refresh = () => invalidateReviewData(qc);

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    const changed = bio.trim() !== t.biography.trim() || spec.trim() !== t.specialties.trim();
    if (status === 'approved' && changed) { setWarn({ label: tr("تعديل النبذة أو التخصصات"), run: doSave }); return; }
    doSave();
  };
  const doSave = () => {
    save.mutate({ data: { biography: bio.trim(), specialties: spec.trim(), available: avail } }, {
      onSuccess: () => { refresh(); toast({ title: tr("تم حفظ الملف") }); },
      onError: (err) => toast({ title: tr("تعذّر الحفظ"), description: errMsg(err), variant: 'destructive' }),
    });
  };

  const doUpload = async (file: File) => {
    setUpMsg('');
    if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) { setUpMsg(tr("الشهادة يجب أن تكون ملف PDF، وليست صورة.")); return; }
    if (file.size < 1 || file.size > MAX) { setUpMsg(tr("حجم الملف يجب ألا يتجاوز ١٠ ميبيبايت.")); return; }
    setUpBusy(true);
    try {
      const r = await reqUp.mutateAsync({ data: { name: file.name.slice(0, 180), size: file.size, contentType: 'application/pdf', kind } });
      const put = await fetch(r.uploadURL, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: file });
      if (!put.ok) throw new Error(tr("فشل إرسال الملف إلى التخزين الخاص."));
      const done = await complete.mutateAsync({ documentId: r.documentId });
      if (done.status !== 'clean') throw new Error(tr("لم يجتز الملف الفحص الأمني ولم يُقبل."));
      toast({ title: tr("اكتمل الرفع واجتاز الفحص") });
    } catch (err) { setUpMsg(errMsg(err, tr("تعذّر رفع الوثيقة."))); }
    finally { setUpBusy(false); if (fileRef.current) fileRef.current.value = ''; refresh(); }
  };
  const guard = (label: string, run: () => void) => (status === 'approved' ? setWarn({ label, run }) : run());
  const onFile = (f?: File) => { if (f) guard(tr("رفع هذه الوثيقة"), () => doUpload(f)); };
  const onRemove = (id: string) => guard(tr("حذف هذه الوثيقة"), () => remove.mutate({ documentId: id }, {
    onSuccess: () => { refresh(); toast({ title: tr("حُذفت الوثيقة") }); },
    onError: (err) => toast({ title: tr("تعذّر الحذف"), description: errMsg(err), variant: 'destructive' }),
  }));
  const retryScan = (id: string) => guard(tr("استكمال فحص هذه الوثيقة"), () => complete.mutate({ documentId: id }, {
    onSuccess: () => { setUpMsg(''); refresh(); toast({ title: tr("اكتمل فحص الوثيقة") }); },
    onError: (err) => { setUpMsg(errMsg(err, tr("تعذّر استكمال الفحص."))); refresh(); },
  }));
  const onSubmit = async () => {
    if (submitting || upBusy || save.isPending || remove.isPending) return;
    setSubmitting(true);
    try {
      // Save the values visible in the form, then submit the returned revision.
      // Never submit a stale revision or silently omit unsaved teacher edits.
      const saved = await save.mutateAsync({ data: { biography: bio.trim(), specialties: spec.trim(), available: false } });
      await submitApp.mutateAsync({ data: { revision: saved.revision ?? 0 } });
      toast({ title: tr("أُرسل الطلب للمراجعة") });
    } catch (err) {
      toast({ title: tr("تعذّر الإرسال"), description: errMsg(err), variant: 'destructive' });
    } finally {
      setConfirmSubmit(false);
      setSubmitting(false);
      refresh();
    }
  };
  const canSubmit = (status === 'draft' || status === 'needs_information' || status === 'rejected') && cleanCount > 0 && !upBusy && !submitting && !save.isPending && !remove.isPending && !complete.isPending;

  return (
    <div>
      <PageHeader eyebrow={tr("المعلم")} title={tr("ملفك العلمي وطلب الاعتماد")}>{tr("وثائقك خاصة دائماً، لا تُنشر ولا تُعرض للطلاب. الاعتماد قرار مراجع في المنصة ولا يمكنك تغييره بنفسك.")}</PageHeader>
      <div className="paper-card star-pattern mb-6 p-7" data-testid="status-teacher">
        <p className="font-ui text-sm text-muted-foreground">{tr("حالة الطلب")}</p>
        <p className="font-display text-2xl font-bold">{APP_STATUS[status]} <span className="font-ui text-xs font-normal text-muted-foreground">{tr("· المراجعة")}{' '}{num(t.revision ?? 0)}{t.submittedAt ? fmt(" · أُرسل {a}", " · sent {a}", { a: fmtDate(t.submittedAt) }) : ''}</span></p>
        <p className="mt-1 font-arabic text-lg leading-loose text-muted-foreground">{DESC[status]}</p>
        {t.reason && (status === 'needs_information' || status === 'rejected' || status === 'approved') ? <div className="mt-3 rounded-xl bg-background p-4" data-testid="text-review-reason"><p className="font-ui text-xs font-bold text-muted-foreground">{tr("سبب المراجع")}</p><p className="font-arabic text-lg leading-loose">{t.reason}</p></div> : null}
        <p className="mt-3 font-ui text-sm font-bold">{status === 'approved' ? tr("متاح للظهور في دليل المشايخ وفق خيار التوفر أدناه.") : tr("غير ظاهر للطلاب حتى الاعتماد.")}</p>
      </div>

      <form onSubmit={onSave} className="paper-card mb-6 space-y-6 p-7" data-testid="form-teacher">
        <div>
          <label htmlFor="bio" className="font-ui text-sm font-bold">{tr("نبذة علمية")}</label>
          <textarea id="bio" value={bio} disabled={locked} onChange={(e) => setBio(e.target.value)} maxLength={2000} rows={7} placeholder={tr("مسيرتك العلمية، ومن أخذت عنهم، وما درّسته.")}
            className="mt-2 w-full rounded-xl border bg-background px-4 py-3 font-arabic text-lg leading-loose outline-none focus:border-secondary disabled:opacity-60" data-testid="input-biography" />
          <p className="text-end font-ui text-xs text-muted-foreground">{num(bio.length)} / {num(2000)}</p>
        </div>
        <div>
          <label htmlFor="spec" className="font-ui text-sm font-bold">{tr("التخصصات")}</label>
          <input id="spec" value={spec} disabled={locked} onChange={(e) => setSpec(e.target.value)} maxLength={300} placeholder={tr("مثل: الحديث، العقيدة، التجويد")} className="mt-2 w-full rounded-xl border bg-background px-4 py-3 font-ui outline-none focus:border-secondary disabled:opacity-60" data-testid="input-specialties" />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl border bg-background p-4">
          <div><p className="font-ui font-bold">{tr("متاح لاستقبال الإحالات")}</p><p className="font-ui text-xs text-muted-foreground">{tr("لا يُتاح تغيير التوفر إلا بعد اعتماد ملفك.")}</p></div>
          <Switch checked={avail} onCheckedChange={setAvail} disabled={status !== 'approved' || save.isPending} aria-label={tr("التوفر")} data-testid="switch-available" />
        </div>
        <button type="submit" disabled={save.isPending || locked} className="rounded-full bg-secondary px-8 py-3 font-ui font-bold text-secondary-foreground disabled:opacity-50" data-testid="button-save-teacher">{save.isPending ? tr("جارٍ الحفظ…") : tr("حفظ الملف")}</button>
      </form>

      <section className="paper-card mb-6 space-y-5 p-7" data-testid="section-documents">
        <h2 className="font-display text-xl font-bold">{tr("شهادة المعلم — PDF إلزامي")}</h2>
        {status === 'approved' ? <Notice tone="amber" title={tr("تنبيه: تعديل الوثائق يُبطل الاعتماد")}>{tr("رفع أو حذف أي وثيقة بعد الاعتماد يُسقط اعتمادك في الخادم فيعود طلبك إلى المراجعة، ولا تظهر للطلاب حتى يُعاد اعتمادك.")}</Notice> : null}
        <div className="flex flex-wrap items-end gap-3">
          <label className="font-ui text-xs font-bold">{tr("النوع")}<select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} disabled={locked || upBusy} className="mt-1 block rounded-xl border bg-background px-3 py-2 font-ui text-sm" data-testid="select-doc-kind">
              <option value="qualification">{tr("مؤهل")}</option><option value="ijaza">{tr("إجازة")}</option>
            </select></label>
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="sr-only" id="doc-file" disabled={locked || upBusy} onChange={(e) => onFile(e.target.files?.[0])} data-testid="input-doc-file" />
          <label htmlFor="doc-file" className={`inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-ui text-sm font-bold text-primary-foreground ${locked || upBusy ? 'pointer-events-none opacity-50' : ''}`}><Upload size={16} /> {upBusy ? tr("جارٍ الرفع والفحص…") : tr("اختر ملفاً")}</label>
          <p className="font-ui text-xs text-muted-foreground">{tr("ارفع شهادة أو إجازة تثبت مؤهلك، بصيغة PDF حتى ١٠ م.ب. تُحفظ خصوصياً وتُفحص قبل إتاحتها للمراجع.")}</p>
        </div>
        {upMsg ? <p className="rounded-xl bg-red-50 p-3 font-ui text-sm text-red-900" role="alert" data-testid="text-upload-error">{upMsg}</p> : null}
        {!docs.length ? <p className="rounded-xl border border-dashed p-6 text-center font-ui text-sm text-muted-foreground" data-testid="empty-documents">{tr("لم ترفع وثائق بعد.")}</p> : (
          <ul className="space-y-2" data-testid="list-documents">{docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3 font-ui text-sm" data-testid={`row-doc-${d.id}`}>
              <span className="min-w-0 break-all font-bold">{d.name}</span><Pill>{DOC_KIND[d.kind]}</Pill><Pill tone={toneOf(d.status)}>{DOC_STATUS[d.status]}</Pill>
              <span className="text-xs text-muted-foreground">{fmtSize(d.size)} · {fmtDate(d.uploadedAt)}</span>
              <span className="ms-auto flex items-center gap-2">
                {d.status === 'clean' && d.contentType === 'application/pdf' ? <DocPreview id={d.id} name={d.name} /> : null}
                {d.status === 'clean' ? <DocDownload id={d.id} name={d.name} /> : null}
                {d.status === 'uploading' ? <button type="button" disabled={locked || upBusy || complete.isPending} onClick={() => retryScan(d.id)} className="min-h-10 rounded-full border px-3 py-1 text-xs font-bold disabled:opacity-50" data-testid={`button-retry-scan-${d.id}`}>{tr("إعادة الفحص")}</button> : null}
                <button type="button" disabled={locked || upBusy || remove.isPending || complete.isPending} onClick={() => onRemove(d.id)} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold hover:bg-muted disabled:opacity-50" data-testid={`button-remove-${d.id}`}><Trash2 size={13} />{' '}{tr("حذف")}</button>
              </span>
            </li>))}</ul>
        )}
        {warn ? (
          <div className="rounded-xl border border-secondary/60 bg-amber-50 p-4" role="alertdialog" data-testid="dialog-invalidate-warning">
            <p className="font-ui text-sm font-bold">{warn.label}{' '}{tr("سيُبطل اعتمادك الحالي ويعيد طلبك إلى المراجعة. هل تريد المتابعة؟")}</p>
            <div className="mt-3 flex gap-3"><button onClick={() => { const r = warn.run; setWarn(null); r(); }} className="rounded-full bg-secondary px-5 py-1.5 font-ui text-sm font-bold text-secondary-foreground" data-testid="button-confirm-invalidate">{tr("متابعة")}</button><button onClick={() => { setWarn(null); if (fileRef.current) fileRef.current.value = ''; }} className="font-ui text-sm underline" data-testid="button-cancel-invalidate">{tr("إلغاء")}</button></div>
          </div>
        ) : null}
        {(status === 'draft' || status === 'needs_information' || status === 'rejected') ? (
          <div className="border-t pt-5">
            {!confirmSubmit ? (
              <button onClick={() => setConfirmSubmit(true)} disabled={!canSubmit} className="rounded-full bg-secondary px-8 py-3 font-ui font-bold text-secondary-foreground disabled:opacity-50" data-testid="button-submit-application">{tr("إرسال الطلب للمراجعة")}</button>
            ) : (
              <div className="flex flex-wrap items-center gap-3"><span className="font-ui text-sm font-bold">{tr("بعد الإرسال تُجمَّد بياناتك حتى القرار. تأكيد؟")}</span>
                <button onClick={onSubmit} disabled={!canSubmit} className="rounded-full bg-secondary px-6 py-2 font-ui text-sm font-bold text-secondary-foreground disabled:opacity-50" data-testid="button-confirm-submit">{submitting ? tr("جارٍ حفظ الملف وإرساله…") : tr("تأكيد الإرسال")}</button>
                <button onClick={() => setConfirmSubmit(false)} className="font-ui text-sm underline">{tr("رجوع")}</button></div>
            )}
            {!cleanCount ? <p className="mt-2 font-ui text-xs text-muted-foreground">{tr("يلزم رفع وثيقة سليمة واحدة على الأقل.")}</p> : null}
          </div>
        ) : null}
      </section>

      <section className="paper-card p-7" data-testid="section-history"><h2 className="mb-3 font-display text-xl font-bold">{tr("سجل المراجعة")}</h2><History items={t.history ?? []} empty={tr("لا قرارات بعد.")} /></section>
    </div>
  );
}
