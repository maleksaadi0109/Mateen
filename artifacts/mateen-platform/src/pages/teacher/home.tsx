import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetTeacherQueryKey, useCompleteQualificationUpload, useGetTeacher, useRemoveQualificationDocument,
  useRequestQualificationUpload, useSaveTeacher, useSubmitTeacherApplication,
} from '@workspace/api-client-react';
import type { QualificationUploadInput } from '@workspace/api-client-react';
import { Trash2, Upload } from 'lucide-react';
import { DocDownload, History, Pill, SecurityNotice, toneOf } from '@/components/admin/parts';
import { ErrorState, LoadingList, Notice, PageHeader } from '@/components/mateen/bits';
import { APP_STATUS, DOC_KIND, DOC_STATUS, errMsg, errStatus, fmtSize, invalidateReviewData } from '@/lib/admin';
import { fmtDate, num, usePageMeta } from '@/lib/mateen';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';

const DESC: Record<string, string> = {
  draft: 'ملفك محفوظ ولم يُرسل بعد. ارفع وثيقة سليمة واحدة على الأقل ثم أرسل الطلب.',
  pending_review: 'طلبك قيد مراجعة المنصة. تُجمَّد النبذة والتخصصات والوثائق حتى صدور القرار.',
  approved: 'اعتمدت المنصة ملفك. أي تعديل على الوثائق يُبطل الاعتماد في الخادم ويعيدك إلى المراجعة.',
  needs_information: 'طلب المراجع معلومات إضافية. اقرأ السبب أدناه، عدّل ثم أعد الإرسال.',
  rejected: 'رُفض الطلب. اقرأ السبب أدناه؛ يمكنك تعديل ملفك وإعادة الإرسال.',
};
const TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
const MAX = 10485760;

export default function TeacherHome() {
  usePageMeta('ملف المعلم | مَتِين', 'ملفك العلمي ووثائقك وحالة طلب الاعتماد.');
  const q = useGetTeacher({ query: { enabled: true, queryKey: getGetTeacherQueryKey() } });
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
  const fileRef = useRef<HTMLInputElement>(null);
  const inited = useRef(false);
  useEffect(() => {
    if (q.data && !inited.current) { inited.current = true; setBio(q.data.biography); setSpec(q.data.specialties); setAvail(q.data.available); }
  }, [q.data]);

  if (q.isLoading) return <LoadingList />;
  if (q.isError || !q.data) {
    if (errStatus(q.error) === 403) return (
      <div className="space-y-4" data-testid="state-teacher-forbidden">
        <PageHeader eyebrow="المعلم" title="ملفك محمي بجلسة موثّقة" />
        <SecurityNotice reason={errMsg(q.error, 'رفض الخادم الطلب لأن جلستك لا تستوفي شروط الأمان.')} />
        <button onClick={() => q.refetch()} className="rounded-full bg-secondary px-6 py-2 font-ui text-sm font-bold text-secondary-foreground" data-testid="button-recheck-teacher">إعادة المحاولة بعد الدخول من جديد</button>
      </div>
    );
    return <ErrorState message={errMsg(q.error, 'تعذّر تحميل ملفك.')} onRetry={() => q.refetch()} />;
  }
  const t = q.data;
  const status = t.status;
  const docs = t.documents ?? [];
  const locked = status === 'pending_review';
  const cleanCount = docs.filter((d) => d.status === 'clean').length;
  const refresh = () => invalidateReviewData(qc);

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    const changed = bio.trim() !== t.biography.trim() || spec.trim() !== t.specialties.trim();
    if (status === 'approved' && changed) { setWarn({ label: 'تعديل النبذة أو التخصصات', run: doSave }); return; }
    doSave();
  };
  const doSave = () => {
    save.mutate({ data: { biography: bio.trim(), specialties: spec.trim(), available: avail } }, {
      onSuccess: () => { refresh(); toast({ title: 'تم حفظ الملف' }); },
      onError: (err) => toast({ title: 'تعذّر الحفظ', description: errMsg(err), variant: 'destructive' }),
    });
  };

  const doUpload = async (file: File) => {
    setUpMsg('');
    if (!TYPES.includes(file.type)) { setUpMsg('النوع غير مدعوم: المسموح PDF أو PNG أو JPEG.'); return; }
    if (file.size < 1 || file.size > MAX) { setUpMsg('حجم الملف يجب ألا يتجاوز ١٠ ميبيبايت.'); return; }
    setUpBusy(true);
    try {
      const r = await reqUp.mutateAsync({ data: { name: file.name.slice(0, 180), size: file.size, contentType: file.type as QualificationUploadInput['contentType'], kind } });
      const put = await fetch(r.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!put.ok) throw new Error('فشل إرسال الملف إلى التخزين الخاص.');
      const done = await complete.mutateAsync({ documentId: r.documentId });
      if (done.status !== 'clean') throw new Error('لم يجتز الملف الفحص الأمني ولم يُقبل.');
      toast({ title: 'اكتمل الرفع واجتاز الفحص' });
    } catch (err) { setUpMsg(errMsg(err, 'تعذّر رفع الوثيقة.')); }
    finally { setUpBusy(false); if (fileRef.current) fileRef.current.value = ''; refresh(); }
  };
  const guard = (label: string, run: () => void) => (status === 'approved' ? setWarn({ label, run }) : run());
  const onFile = (f?: File) => { if (f) guard('رفع هذه الوثيقة', () => doUpload(f)); };
  const onRemove = (id: string) => guard('حذف هذه الوثيقة', () => remove.mutate({ documentId: id }, {
    onSuccess: () => { refresh(); toast({ title: 'حُذفت الوثيقة' }); },
    onError: (err) => toast({ title: 'تعذّر الحذف', description: errMsg(err), variant: 'destructive' }),
  }));
  const onSubmit = () => submitApp.mutate({ data: { revision: t.revision ?? 0 } }, {
    onSuccess: () => { setConfirmSubmit(false); refresh(); toast({ title: 'أُرسل الطلب للمراجعة' }); },
    onError: (err) => { setConfirmSubmit(false); toast({ title: 'تعذّر الإرسال', description: errMsg(err), variant: 'destructive' }); },
  });
  const canSubmit = (status === 'draft' || status === 'needs_information' || status === 'rejected') && cleanCount > 0 && !upBusy;

  return (
    <div>
      <PageHeader eyebrow="المعلم" title="ملفك العلمي وطلب الاعتماد">وثائقك خاصة دائماً، لا تُنشر ولا تُعرض للطلاب. الاعتماد قرار مراجع في المنصة ولا يمكنك تغييره بنفسك.</PageHeader>
      <div className="paper-card star-pattern mb-6 p-7" data-testid="status-teacher">
        <p className="font-ui text-sm text-muted-foreground">حالة الطلب</p>
        <p className="font-display text-2xl font-bold">{APP_STATUS[status]} <span className="font-ui text-xs font-normal text-muted-foreground">· المراجعة {num(t.revision ?? 0)}{t.submittedAt ? ` · أُرسل ${fmtDate(t.submittedAt)}` : ''}</span></p>
        <p className="mt-1 font-arabic text-lg leading-loose text-muted-foreground">{DESC[status]}</p>
        {t.reason && (status === 'needs_information' || status === 'rejected' || status === 'approved') ? <div className="mt-3 rounded-xl bg-background p-4" data-testid="text-review-reason"><p className="font-ui text-xs font-bold text-muted-foreground">سبب المراجع</p><p className="font-arabic text-lg leading-loose">{t.reason}</p></div> : null}
        <p className="mt-3 font-ui text-sm font-bold">{status === 'approved' ? 'متاح للظهور في دليل المشايخ وفق خيار التوفر أدناه.' : 'غير ظاهر للطلاب حتى الاعتماد.'}</p>
      </div>

      <form onSubmit={onSave} className="paper-card mb-6 space-y-6 p-7" data-testid="form-teacher">
        <div>
          <label htmlFor="bio" className="font-ui text-sm font-bold">نبذة علمية</label>
          <textarea id="bio" value={bio} disabled={locked} onChange={(e) => setBio(e.target.value)} maxLength={2000} rows={7} placeholder="مسيرتك العلمية، ومن أخذت عنهم، وما درّسته."
            className="mt-2 w-full rounded-xl border bg-background px-4 py-3 font-arabic text-lg leading-loose outline-none focus:border-secondary disabled:opacity-60" data-testid="input-biography" />
          <p className="text-left font-ui text-xs text-muted-foreground">{num(bio.length)} / {num(2000)}</p>
        </div>
        <div>
          <label htmlFor="spec" className="font-ui text-sm font-bold">التخصصات</label>
          <input id="spec" value={spec} disabled={locked} onChange={(e) => setSpec(e.target.value)} maxLength={300} placeholder="مثل: الحديث، العقيدة، التجويد" className="mt-2 w-full rounded-xl border bg-background px-4 py-3 font-ui outline-none focus:border-secondary disabled:opacity-60" data-testid="input-specialties" />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl border bg-background p-4">
          <div><p className="font-ui font-bold">متاح لاستقبال الإحالات</p><p className="font-ui text-xs text-muted-foreground">لا يُتاح تغيير التوفر إلا بعد اعتماد ملفك.</p></div>
          <Switch checked={avail} onCheckedChange={setAvail} disabled={status !== 'approved' || save.isPending} aria-label="التوفر" data-testid="switch-available" />
        </div>
        <button type="submit" disabled={save.isPending || locked} className="rounded-full bg-secondary px-8 py-3 font-ui font-bold text-secondary-foreground disabled:opacity-50" data-testid="button-save-teacher">{save.isPending ? 'جارٍ الحفظ…' : 'حفظ الملف'}</button>
      </form>

      <section className="paper-card mb-6 space-y-5 p-7" data-testid="section-documents">
        <h2 className="font-display text-xl font-bold">الوثائق والإجازات</h2>
        {status === 'approved' ? <Notice tone="amber" title="تنبيه: تعديل الوثائق يُبطل الاعتماد">رفع أو حذف أي وثيقة بعد الاعتماد يُسقط اعتمادك في الخادم فيعود طلبك إلى المراجعة، ولا تظهر للطلاب حتى يُعاد اعتمادك.</Notice> : null}
        <div className="flex flex-wrap items-end gap-3">
          <label className="font-ui text-xs font-bold">النوع
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} disabled={locked || upBusy} className="mt-1 block rounded-xl border bg-background px-3 py-2 font-ui text-sm" data-testid="select-doc-kind">
              <option value="qualification">مؤهل</option><option value="ijaza">إجازة</option>
            </select></label>
          <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" id="doc-file" disabled={locked || upBusy} onChange={(e) => onFile(e.target.files?.[0])} data-testid="input-doc-file" />
          <label htmlFor="doc-file" className={`inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-ui text-sm font-bold text-primary-foreground ${locked || upBusy ? 'pointer-events-none opacity-50' : ''}`}><Upload size={16} /> {upBusy ? 'جارٍ الرفع والفحص…' : 'اختر ملفاً'}</label>
          <p className="font-ui text-xs text-muted-foreground">PDF أو PNG أو JPEG، حتى ١٠ م.ب. تُفحص الملفات ويُرفض ما لا يجتاز الفحص.</p>
        </div>
        {upMsg ? <p className="rounded-xl bg-red-50 p-3 font-ui text-sm text-red-900" role="alert" data-testid="text-upload-error">{upMsg}</p> : null}
        {!docs.length ? <p className="rounded-xl border border-dashed p-6 text-center font-ui text-sm text-muted-foreground" data-testid="empty-documents">لم ترفع وثائق بعد.</p> : (
          <ul className="space-y-2" data-testid="list-documents">{docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3 font-ui text-sm" data-testid={`row-doc-${d.id}`}>
              <span className="font-bold">{d.name}</span><Pill>{DOC_KIND[d.kind]}</Pill><Pill tone={toneOf(d.status)}>{DOC_STATUS[d.status]}</Pill>
              <span className="text-xs text-muted-foreground">{fmtSize(d.size)} · {fmtDate(d.uploadedAt)}</span>
              <span className="mr-auto flex items-center gap-2">
                <DocDownload id={d.id} name={d.name} />
                <button type="button" disabled={locked || remove.isPending} onClick={() => onRemove(d.id)} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold hover:bg-muted disabled:opacity-50" data-testid={`button-remove-${d.id}`}><Trash2 size={13} /> حذف</button>
              </span>
            </li>))}</ul>
        )}
        {warn ? (
          <div className="rounded-xl border border-secondary/60 bg-amber-50 p-4" role="alertdialog" data-testid="dialog-invalidate-warning">
            <p className="font-ui text-sm font-bold">{warn.label} سيُبطل اعتمادك الحالي ويعيد طلبك إلى المراجعة. هل تريد المتابعة؟</p>
            <div className="mt-3 flex gap-3"><button onClick={() => { const r = warn.run; setWarn(null); r(); }} className="rounded-full bg-secondary px-5 py-1.5 font-ui text-sm font-bold text-secondary-foreground" data-testid="button-confirm-invalidate">متابعة</button><button onClick={() => { setWarn(null); if (fileRef.current) fileRef.current.value = ''; }} className="font-ui text-sm underline" data-testid="button-cancel-invalidate">إلغاء</button></div>
          </div>
        ) : null}
        {(status === 'draft' || status === 'needs_information' || status === 'rejected') ? (
          <div className="border-t pt-5">
            {!confirmSubmit ? (
              <button onClick={() => setConfirmSubmit(true)} disabled={!canSubmit} className="rounded-full bg-secondary px-8 py-3 font-ui font-bold text-secondary-foreground disabled:opacity-50" data-testid="button-submit-application">إرسال الطلب للمراجعة</button>
            ) : (
              <div className="flex flex-wrap items-center gap-3"><span className="font-ui text-sm font-bold">بعد الإرسال تُجمَّد بياناتك حتى القرار. تأكيد؟</span>
                <button onClick={onSubmit} disabled={submitApp.isPending} className="rounded-full bg-secondary px-6 py-2 font-ui text-sm font-bold text-secondary-foreground disabled:opacity-50" data-testid="button-confirm-submit">{submitApp.isPending ? 'جارٍ الإرسال…' : 'تأكيد الإرسال'}</button>
                <button onClick={() => setConfirmSubmit(false)} className="font-ui text-sm underline">رجوع</button></div>
            )}
            {!cleanCount ? <p className="mt-2 font-ui text-xs text-muted-foreground">يلزم رفع وثيقة سليمة واحدة على الأقل.</p> : null}
          </div>
        ) : null}
      </section>

      <section className="paper-card p-7" data-testid="section-history"><h2 className="mb-3 font-display text-xl font-bold">سجل المراجعة</h2><History items={t.history ?? []} empty="لا قرارات بعد." /></section>
    </div>
  );
}
