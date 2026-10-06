import { fmt } from '@/lib/i18n';
import { tr } from '@/lib/i18n';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { Link } from 'wouter';
import { CalendarClock, Check, Play, RefreshCw } from 'lucide-react';
import { ErrorState, SkeletonBlock } from '@/components/mateen/bits';
import { errorStatus, useDailyPlanData, useDailyPlanWrites, withTaskParams } from '@/hooks/use-daily-plan';
import type { DailyPlanTask } from '@/hooks/use-daily-plan';
import { num } from '@/lib/mateen';

const KIND: Record<DailyPlanTask['kind'], string> = { get confirmed_review() { return tr("مراجعة مؤكدة"); }, get word_practice() { return tr("كلمات صعبة"); }, get new_learning() { return tr("تعلّم جديد"); } };
const STATUS: Record<DailyPlanTask['status'], string> = { get pending() { return tr("لم تبدأ"); }, get started() { return tr("بدأتها"); }, get completed() { return tr("مكتملة"); }, get unavailable() { return tr("غير متاحة الآن"); } };

export function DailyPlanCard() {
  const { query } = useDailyPlanData();
  const { act, redistribute, refresh } = useDailyPlanWrites();
  const [, go] = useLocation();
  const [msg, setMsg] = useState('');
  const plan = query.data;

  const start = async (t: DailyPlanTask) => {
    if (!plan?.id) return;
    setMsg('');
    try {
      const next = await act.mutateAsync({ planId: plan.id, taskId: t.id, data: { action: 'start' } });
      void refresh(next);
      const nt = next.tasks.find((x) => x.id === t.id) ?? t;
      go(withTaskParams(nt.href, plan.id, t.id));
    } catch (e) {
      void refresh();
      setMsg(errorStatus(e) === 409 || errorStatus(e) === 410 ? tr("تغيّرت الخطة أو انتهى يومها. حدّثناها لك؛ راجعها ثم ابدأ من جديد.") : tr("تعذّر بدء المهمة. لم يتغيّر شيء؛ أعد المحاولة."));
    }
  };
  const ack = async (t: DailyPlanTask) => {
    if (!plan?.id) return;
    setMsg('');
    try { void refresh(await act.mutateAsync({ planId: plan.id, taskId: t.id, data: { action: 'acknowledge' } })); }
    catch { void refresh(); setMsg(tr("تعذّر تسجيل إقرارك. أعد المحاولة.")); }
  };
  const redo = async () => {
    if (!plan?.id) return;
    setMsg('');
    try { void refresh(await redistribute.mutateAsync({ data: { planId: plan.id, revision: plan.revision } })); }
    catch (e) { void refresh(); setMsg(errorStatus(e) === 409 ? tr("تغيّرت الخطة قبل إعادة التوزيع. حدّثناها؛ أعد الضغط إن بقيت الحاجة.") : tr("تعذّرت إعادة التوزيع. أعد المحاولة.")); }
  };

  const total = plan?.tasks.reduce((s, t) => s + t.minutes, 0) ?? 0;
  return (
    <section className="paper-card mb-6 p-5 sm:p-7" aria-label={tr("برنامجك اليوم")} data-testid="daily-plan">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-2xl font-bold"><CalendarClock size={22} className="text-secondary" />{tr("برنامجك اليوم")}</h2>
        {plan && plan.status !== 'needs_preferences' && <span className="font-ui text-xs text-muted-foreground" data-testid="text-plan-budget">{tr("ميزانيتك")}{' '}{num(plan.dailyMinutes)}{' '}{tr("دقيقة · المجموع التقديري")}{' '}{num(total)}</span>}
      </div>
      {query.isLoading ? <div className="mt-4 space-y-3"><SkeletonBlock className="h-16" /><SkeletonBlock className="h-16" /></div>
        : query.isError || !plan ? <div className="mt-3"><ErrorState message={tr("تعذّر تحميل برنامج اليوم. لا نعرض خطة فارغة بدلها.")} onRetry={() => query.refetch()} /></div>
        : (
          <>
            <p className="mt-2 font-ui text-xs leading-relaxed text-muted-foreground">{tr("الدقائق تقديرية لتنظيم يومك، لا قياس لوقتك الفعلي. المراجعات المؤجلة لا تتغيّر مواعيدها بسبب هذه الخطة.")}</p>
            {plan.preferencesChanged && (
              <div role="status" className="mt-3 rounded-xl border border-secondary/40 bg-secondary/5 p-3 font-ui text-sm" data-testid="notice-plan-preferences-changed">
                <p>{tr("غيّرتَ تفضيلاتك بعد إعداد خطة اليوم. لن نعيد ترتيبها تلقائياً؛ المهام المكتملة والتي بدأتها تبقى كما هي.")}</p>
                <button type="button" onClick={redo} disabled={redistribute.isPending} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-secondary px-5 font-bold text-secondary-foreground disabled:opacity-50" data-testid="button-redistribute"><RefreshCw size={15} />{redistribute.isPending ? tr("جارٍ إعادة التوزيع…") : tr("أعد توزيع الباقي")}</button>
              </div>
            )}
            {plan.committedOverBudget && <p role="status" className="mt-3 rounded-xl border border-amber-600/40 p-3 font-ui text-sm" data-testid="notice-plan-over-budget">{tr("ما بدأتَه أو أتممتَه اليوم يتجاوز ميزانيتك الحالية. نعرضه كما هو ولا نخفيه، ولن نضيف عليه مهاماً جديدة.")}</p>}
            {(plan.deferredCount > 0 || plan.staleCount > 0) && <p className="mt-3 font-ui text-xs text-muted-foreground" data-testid="text-plan-deferred">{plan.deferredCount > 0 ? fmt("{a} عنصر آخر بقي في قائمته؛ مواعيد المراجعات لا تتغير. ", "{a} more item(s) stayed in their list; review dates don't change. ", { a: num(plan.deferredCount) }) : ''}{plan.staleCount > 0 ? fmt("{a} عنصر لم يعد مصدره صالحاً.", "{a} item(s) no longer have a valid source.", { a: num(plan.staleCount) }) : ''}</p>}
            {plan.status === 'needs_preferences' && <div className="mt-4 rounded-xl border border-dashed p-4 font-ui text-sm"><p>{tr("نحتاج تفضيلات دراستك لنبني برنامجاً.")}</p><Link href="/student/settings" className="mt-2 inline-flex min-h-11 items-center font-bold text-secondary underline" data-testid="link-plan-preferences">{tr("افتح الإعدادات")}</Link></div>}
            {plan.status === 'needs_calendar' && <p className="mt-4 rounded-xl border border-dashed p-4 font-ui text-sm" role="status" data-testid="notice-plan-calendar">{tr("تقويم الحساب لم يُحدَّد بعد. أعد تحميل الصفحة بعد لحظات.")}</p>}
            {plan.status === 'expired' && <div className="mt-4 rounded-xl border p-4 font-ui text-sm" role="status">{tr("انتهى يوم هذه الخطة. تُنهي المهام المبدوءة في يومها الأصلي، وخطة اليوم الجديد تُبنى الآن.")}<button type="button" onClick={() => query.refetch()} className="mx-2 min-h-11 font-bold text-secondary underline">{tr("حدّث")}</button></div>}
            {plan.status === 'empty' && <p className="mt-4 rounded-xl border border-dashed p-4 font-ui text-sm" data-testid="empty-plan">{tr("لا محتوى صالح مقترح ضمن هدفك الآن. يمكنك مراجعة القوائم أو متابعة الخريطة.")}</p>}
            {plan.status === 'completed' && <p className="mt-4 rounded-xl border p-4 font-ui text-sm" role="status" data-testid="text-plan-completed">{tr("أنهيتَ مهام اليوم المخططة. هذا إنجاز في الخطة وليس حكماً على إتقانك.")}</p>}
            {msg && <p role="alert" className="mt-3 font-ui text-sm text-destructive" data-testid="text-plan-error">{msg}</p>}
            <ul className="mt-4 space-y-3">
              {plan.tasks.map((t) => (
                <li key={t.id} className="rounded-2xl border bg-card p-4" data-testid={`task-${t.id}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-ui text-xs font-bold text-secondary">{KIND[t.kind]} · {num(t.minutes)}{' '}{tr("د تقريباً ·")}{' '}{STATUS[t.status]}</p>
                      <p className="mt-1 font-display text-lg font-bold">{t.title}</p>
                      <p className="mt-1 font-ui text-sm text-muted-foreground">{t.reason}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(t.status === 'pending' || t.status === 'started') && plan.status === 'ready' && (
                        <button type="button" onClick={() => start(t)} disabled={act.isPending} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-secondary px-5 font-ui text-sm font-bold text-secondary-foreground disabled:opacity-50" data-testid={`button-start-${t.id}`}><Play size={14} />{t.status === 'started' ? tr("تابع") : tr("ابدأ")}</button>
                      )}
                      {t.status === 'started' && t.kind !== 'confirmed_review' && (
                        <button type="button" onClick={() => ack(t)} disabled={act.isPending} className="inline-flex min-h-11 items-center gap-2 rounded-full border px-5 font-ui text-sm font-bold disabled:opacity-50" data-testid={`button-ack-${t.id}`}><Check size={14} />{tr("أقرّ بأنني أنهيتها")}</button>
                      )}
                    </div>
                  </div>
                  {t.status === 'unavailable' && <p className="mt-2 font-ui text-xs text-muted-foreground">{tr("لم يعد مصدر هذه المهمة متاحاً.")}</p>}
                  {t.status === 'started' && t.kind === 'confirmed_review' && <p className="mt-2 font-ui text-xs text-muted-foreground">{tr("تكتمل المراجعة المؤكدة عند إرسال إجابتها فقط.")}</p>}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-4 font-ui text-sm">
              <Link href="/student/settings" className="inline-flex min-h-11 items-center font-bold text-secondary underline">{tr("إعدادات الهدف والوقت")}</Link>
              {!plan.preferencesChanged && (plan.tasks.some(t => t.status === 'unavailable') || plan.status === 'empty') && plan.id && <button type="button" onClick={redo} disabled={redistribute.isPending} className="min-h-11 font-bold text-secondary underline">{tr("أعد توزيع المتبقي من المصادر الحالية")}</button>}
            </div>
            <p className="mt-3 font-ui text-xs text-muted-foreground">{tr("إقرارك الذاتي يسجّل أنك أنهيت المهمة في خطتك، ولا يُحسب نشاطاً دراسياً ولا إتقاناً.")}</p>
          </>
        )}
    </section>
  );
}
