import { tr } from '@/lib/i18n';
import { useState } from 'react';
import { Link, useSearchParams } from 'wouter';
import { ArrowRight, Check } from 'lucide-react';
import { useDailyPlanData, useDailyPlanWrites } from '@/hooks/use-daily-plan';

export function TaskSessionBanner() {
  const [sp] = useSearchParams();
  const planId = sp.get('planId');
  const taskId = sp.get('taskId');
  const { query } = useDailyPlanData(planId, !!planId && !!taskId);
  const { act, refresh } = useDailyPlanWrites();
  const [msg, setMsg] = useState('');
  if (!planId || !taskId) return null;
  const plan = query.data;
  const wrap = 'mb-5 rounded-2xl border border-secondary/40 bg-secondary/5 p-4 font-ui text-sm';
  const back = <Link href="/student" className="inline-flex min-h-11 items-center gap-1.5 font-bold text-secondary underline" data-testid="link-task-return"><ArrowRight size={15} />{tr("العودة إلى برنامج اليوم")}</Link>;
  if (query.isLoading) return <div className={wrap} aria-busy data-testid="banner-task-loading">{tr("جارٍ تحميل مهمتك…")}</div>;
  if (query.isError || !plan) return <div className={wrap} role="alert" data-testid="banner-task-error">{tr("تعذّر قراءة حالة المهمة.")}{' '}<button type="button" className="min-h-11 font-bold underline" onClick={() => query.refetch()}>{tr("أعد المحاولة")}</button> {back}</div>;
  if (plan.id !== planId) return (
    <div className={wrap} role="status" data-testid="banner-task-old-day">{tr("هذه المهمة من خطة يوم سابق. تُنهى المهمة المبدوءة في يومها الأصلي، ولا يمكن بدء مهام جديدة منها بعد منتصف الليل. يمكنك متابعة القراءة هنا بحرية.")}{' '}{back}
    </div>
  );
  const task = plan.tasks.find((t) => t.id === taskId);
  if (!task) return <div className={wrap} role="status" data-testid="banner-task-missing">{tr("لم تعد هذه المهمة ضمن خطة اليوم.")}{' '}{back}</div>;
  const canAck = task.status === 'started' && task.kind !== 'confirmed_review';
  const ack = async () => {
    setMsg('');
    try { void refresh(await act.mutateAsync({ planId, taskId, data: { action: 'acknowledge' } })); }
    catch { void refresh(); setMsg(tr("تعذّر تسجيل إقرارك. أعد المحاولة.")); }
  };
  return (
    <div className={wrap} data-testid="banner-task-session">
      <p className="font-bold">{tr("مهمة من برنامج اليوم:")}{' '}{task.title}</p>
      {plan.status === 'expired' && <p className="mt-1 text-muted-foreground" data-testid="banner-task-old-day">{tr("انتهى يوم هذه الخطة. إتمام المهمة المبدوءة يُحفظ في يومها الأصلي فقط؛ افتح برنامج اليوم للأعمال الجديدة.")}</p>}
      {task.status === 'unavailable' && <p className="mt-1 text-muted-foreground">{tr("تغيّر المصدر أو حُذف التدريب؛ لا يمكن تسجيل إنجاز عليه. عُد إلى الخطة لإعادة توزيع المتبقي.")}</p>}
      {task.status === 'completed' && <p className="mt-1 text-muted-foreground">{tr("سُجّلت هذه المهمة مكتملة في خطتك.")}</p>}
      {task.kind === 'confirmed_review' && task.status !== 'completed' && <p className="mt-1 text-muted-foreground">{tr("تكتمل بإرسال إجابة المراجعة نفسها.")}</p>}
      {canAck && <p className="mt-1 text-muted-foreground">{tr("إقرارك ذاتي لتنظيم خطتك، لا يُعدّ نشاطاً ولا إتقاناً.")}</p>}
      {msg && <p role="alert" className="mt-1 text-destructive">{msg}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-4">
        {back}
        {canAck && <button type="button" onClick={ack} disabled={act.isPending} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-secondary px-5 font-bold text-secondary-foreground disabled:opacity-50" data-testid="button-task-ack"><Check size={15} />{tr("أقرّ بأنني أنهيتها")}</button>}
      </div>
    </div>
  );
}
