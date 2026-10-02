import { useState } from 'react';
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
  if (q.isLoading) return <LoadingList rows={1} />;
  if (q.isError || !q.data) return <ErrorState message="تعذّر تجهيز معاينة الإحالة." onRetry={() => q.refetch()} />;
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
        toast({ title: noTeachers ? 'سُجّل طلبك وهو بانتظار معلم' : 'أُرسلت الإحالة' });
        onClose();
      },
      onError: () => setErr('تعذّرت الإحالة: ربما صار المعلم غير متاح أو أُحيل السؤال سابقاً. حدّث المعاينة وأعد المحاولة.'),
    });
  };
  return (
    <div className="mt-4 space-y-4 rounded-2xl border-2 border-secondary/40 bg-background p-5" data-testid="panel-referral">
      <h4 className="font-display text-lg font-bold">معاينة ما سيُشارَك</h4>
      <p className="font-ui text-sm text-muted-foreground">لا يُشارَك شيء قبل موافقتك الصريحة. السبب: {p.reason}</p>
      <ul className="list-disc space-y-1 ps-5 font-ui text-sm">{p.shares.map((s, i) => <li key={i}>{s}</li>)}</ul>
      <blockquote className="border-s-2 border-secondary ps-3 font-arabic leading-loose">{p.question}{p.textContext && <span className="mt-2 block text-sm text-muted-foreground">{p.textContext}</span>}</blockquote>
      {noTeachers ? (
        <p className="rounded-xl bg-muted p-3 font-ui text-sm" data-testid="text-no-teachers">لا يوجد معلم معتمد متاح الآن. يمكنك تسجيل الطلب ليبقى بانتظار معلم، ولن يُنسب إلى أحد قبل قبوله.</p>
      ) : (
        <div className="space-y-2" role="radiogroup" aria-label="اختيار المعلم">
          {p.teachers.map((t) => (
            <label key={t.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${teacherId === t.id ? 'border-secondary bg-card' : ''}`}>
              <input type="radio" name="teacher" checked={teacherId === t.id} onChange={() => setTeacherId(t.id)} data-testid={`radio-teacher-${t.id}`} />
              <span><b className="font-ui text-sm">{t.name}</b><span className="block font-ui text-xs text-muted-foreground">{t.specialties}</span></span>
            </label>
          ))}
        </div>
      )}
      <label className="flex items-start gap-3 font-ui text-sm"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="checkbox-consent" />أوافق على مشاركة ما سبق مع المعلم المختار.</label>
      {err && <p role="alert" className="font-ui text-sm text-destructive" data-testid="text-referral-error">{err}</p>}
      <div className="flex gap-3">
        <button className={btnPrimary} disabled={!consent || refer.isPending || (!noTeachers && !teacherId)} onClick={submit} data-testid="button-confirm-referral">{noTeachers ? 'سجّل الطلب بانتظار معلم' : 'أرسل الإحالة'}</button>
        <button className={btnGhost} onClick={onClose} data-testid="button-cancel-referral">إلغاء</button>
      </div>
    </div>
  );
}
