import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { getGetAssessmentQueryKey, getGetAssessmentSummaryQueryKey, useDeleteAssessmentAudio } from '@workspace/api-client-react';
import type { AssessmentQuestion } from '@workspace/api-client-react';
import { errorMessage } from '@/lib/assessment';
import { num } from '@/lib/mateen';

export function AttemptAudioPrivacy({ attemptId, questions }: { attemptId: string; sessionId: string; questions: AssessmentQuestion[] }) {
  const qc = useQueryClient();
  const del = useDeleteAssessmentAudio();
  const [asking, setAsking] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const oral = questions.filter((q) => q.kind === 'oral' && q.audioReceived);
  if (!oral.length) return null;

  const remove = async (questionId: string) => {
    setMsg(null);
    try {
      await del.mutateAsync({ attemptId, questionId });
      setAsking(null);
      setMsg('حُذف الصوت فقط من الخادم.');
      qc.invalidateQueries({ queryKey: getGetAssessmentQueryKey(attemptId) });
      qc.invalidateQueries({ queryKey: getGetAssessmentSummaryQueryKey() });
    } catch (e) { setMsg(errorMessage(e, 'تعذّر الحذف؛ الصوت لم يُحذف. أعد المحاولة.')); }
  };

  return (
    <section className="paper-card p-5" data-testid="panel-audio-privacy">
      <h3 className="font-display font-bold">تسجيلاتك الصوتية</h3>
      <p className="mt-1 font-ui text-xs leading-6 text-muted-foreground">يُحتفظ بالصوت ٣٠ يوماً. الحذف هنا يمسح الصوت فقط ولا يغيّر نتيجة اختبار مصحَّح.</p>
      <ul className="mt-3 space-y-2">
        {oral.map((q) => (
          <li key={q.id} className="rounded-xl border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-ui text-sm">السؤال {num(q.position)}</span>
              <button onClick={() => setAsking(q.id)} disabled={del.isPending} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 font-ui text-xs font-bold disabled:opacity-50"><Trash2 size={13} /> احذف الصوت</button>
            </div>
            {asking === q.id && (
              <div role="alertdialog" className="mt-2 space-y-2 font-ui text-xs leading-6">
                <p>إن لم تُراجَع هذه الإجابة بعد، فحذف الصوت يحوّل المحاولة إلى مراجعة تقنية دون أي درجة تعليمية صفرية ولا انتظار.</p>
                <div className="flex gap-2">
                  <button onClick={() => remove(q.id)} disabled={del.isPending} className="rounded-full bg-secondary px-4 py-1.5 font-bold text-secondary-foreground disabled:opacity-50">{del.isPending ? 'جارٍ الحذف...' : 'تأكيد حذف الصوت'}</button>
                  <button onClick={() => setAsking(null)} className="rounded-full border px-4 py-1.5 font-bold">إلغاء</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {msg && <p role="status" className="mt-2 font-ui text-sm">{msg}</p>}
    </section>
  );
}
