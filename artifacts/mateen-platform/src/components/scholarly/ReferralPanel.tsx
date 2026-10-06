import { tr } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetMateenAssistantQuestionsQueryKey, getGetMateenConversationsQueryKey, getGetMateenReferralPreviewQueryKey, getGetMateenTeacherReferralsQueryKey, useGetMateenReferralPreview, useReferMateenAssistantQuestion } from '@workspace/api-client-react';
import { ErrorState, LoadingList } from '@/components/mateen/bits';
import { useToast } from '@/hooks/use-toast';
import { btnGhost, btnPrimary } from './shared';

export function ReferralPanel({ questionId, onClose }: { questionId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useGetMateenReferralPreview(questionId, { query: { enabled: true, queryKey: getGetMateenReferralPreviewQueryKey(questionId) } });
  const refer = useReferMateenAssistantQuestion();
  const [consent, setConsent] = useState(false);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const teachers = q.data?.teachers;
  useEffect(() => {
    // Suggest a real, currently approved available teacher; never imply consent.
    if (!teachers) return;
    setTeacherId(current => teachers.some(t => t.id === current) ? current
      : (teachers.find(t => /حديث|سنة|سنّة/.test(t.specialties)) ?? teachers[0])?.id ?? null);
    setConsent(false);
  }, [teachers]);
  if (q.isLoading) return <LoadingList rows={1} />;
  if (q.isError || !q.data) return <ErrorState message={tr("تعذّر تجهيز معاينة الإحالة.")} onRetry={() => q.refetch()} />;
  const p = q.data;
  const noTeachers = p.teachers.length === 0;
  const submit = () => {
    setErr('');
    refer.mutate({ questionId, data: { consent: true, teacherId: noTeachers ? null : teacherId } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetMateenAssistantQuestionsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetMateenConversationsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetMateenTeacherReferralsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetMateenReferralPreviewQueryKey(questionId) });
        toast({ title: noTeachers ? tr("سُجّل طلبك وهو بانتظار معلم") : tr("أُرسلت الإحالة") });
        onClose();
      },
      onError: () => setErr(tr("تعذّرت الإحالة: ربما صار المعلم غير متاح أو أُحيل السؤال سابقاً. حدّث المعاينة وأعد المحاولة.")),
    });
  };
  return (
    <div className="mt-4 space-y-4 rounded-2xl border-2 border-secondary/40 bg-background p-5" data-testid="panel-referral">
      <h4 className="font-display text-lg font-bold">{tr("إحالة إلى شيخ")}</h4>
      {!noTeachers && <div className="rounded-xl border border-secondary/30 bg-card p-4" data-testid="card-suggested-teacher">
        <p className="font-ui text-xs font-bold text-secondary">{tr("الشيخ المقترح للإحالة")}</p>
        <p className="mt-1 font-display text-lg font-bold">{p.teachers.find(t => t.id === teacherId)?.name}</p>
        <p className="mt-1 font-ui text-sm text-muted-foreground">{p.teachers.find(t => t.id === teacherId)?.specialties}</p>
        <p className="mt-2 font-ui text-xs text-muted-foreground">{tr("يمكنك اختيار معلم آخر أدناه. لن يُرسل الحوار قبل موافقتك.")}</p>
      </div>}
      <p className="font-ui text-sm text-muted-foreground">{tr("لا يُشارَك شيء قبل موافقتك الصريحة. السبب:")}{' '}{p.reason}</p>
      <ul className="max-h-72 list-disc space-y-2 overflow-y-auto whitespace-pre-wrap break-words ps-5 font-ui text-sm">{p.shares.map((s, i) => <li key={i}>{s}</li>)}</ul>
      <p className="rounded-xl bg-muted p-3 font-ui text-sm" data-testid="text-share-scope">{tr("ستُشارَك مع المعلم محادثتك المحددة كاملة، بما فيها أسئلتك وإجابات المساعد السابقة فيها. لا تُشارَك أي محادثة أخرى.")}</p>
      <blockquote className="border-s-2 border-secondary ps-3 font-arabic leading-loose">{p.question}{p.textContext && <span className="mt-2 block text-sm text-muted-foreground">{p.textContext}</span>}</blockquote>
      {noTeachers ? (
        <p className="rounded-xl bg-muted p-3 font-ui text-sm" data-testid="text-no-teachers">{tr("لا يوجد معلم معتمد متاح الآن. يمكنك تسجيل الطلب ليبقى بانتظار معلم، ولن يُنسب إلى أحد قبل قبوله.")}</p>
      ) : (
        <div className="space-y-2" role="radiogroup" aria-label={tr("اختيار المعلم")}>
          {p.teachers.map((t) => (
            <label key={t.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${teacherId === t.id ? 'border-secondary bg-card' : ''}`}>
              <input type="radio" name="teacher" checked={teacherId === t.id} onChange={() => { setTeacherId(t.id); setConsent(false); }} data-testid={`radio-teacher-${t.id}`} />
              <span><b className="font-ui text-sm">{t.name}</b><span className="block font-ui text-xs text-muted-foreground">{t.specialties}</span></span>
            </label>
          ))}
        </div>
      )}
      <label className="flex items-start gap-3 font-ui text-sm"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="checkbox-consent" />{tr("أوافق على مشاركة ما سبق مع المعلم المختار.")}</label>
      {err && <p role="alert" className="font-ui text-sm text-destructive" data-testid="text-referral-error">{err}</p>}
      <div className="flex gap-3">
        <button className={btnPrimary} disabled={!consent || refer.isPending || (!noTeachers && !teacherId)} onClick={submit} data-testid="button-confirm-referral">{noTeachers ? tr("سجّل الطلب بانتظار معلم") : tr("أرسل الإحالة")}</button>
        <button className={btnGhost} onClick={onClose} data-testid="button-cancel-referral">{tr("إلغاء")}</button>
      </div>
    </div>
  );
}
