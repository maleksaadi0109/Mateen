import { useStudyActivity } from '@/hooks/use-study-activity';
import { num } from '@/lib/mateen';

export function StudyContinuity() {
  const query = useStudyActivity();
  const activity = query.data;
  return (
    <section className="rounded-2xl border bg-card p-4 font-ui" data-testid="study-continuity" aria-label="استمرارية الدراسة">
      <h2 className="font-display text-lg font-bold">استمرارية الدراسة الفعلية</h2>
      {query.isError ? <p role="alert" className="mt-2 text-sm">تعذّر تحميل أيام الدراسة؛ لا نعرضها صفراً.
        <button onClick={() => query.refetch()} className="mx-2 min-h-10 underline">إعادة المحاولة</button>
      </p> : !activity ? <p className="mt-2 text-sm" role="status">جارٍ تحميل الاستمرارية…</p> : (
        <>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <p>السلسلة الحالية: <strong data-testid="activity-current">{num(activity.currentStreak)}</strong> يوم</p>
            <p>الأطول: <strong data-testid="activity-longest">{num(activity.longestStreak)}</strong> يوم</p>
            <p>أيام الدراسة: <strong data-testid="activity-days">{num(activity.activeDays)}</strong></p>
          </div>
          <p className="mt-2 text-xs text-secondary" data-testid="activity-today">{activity.studiedToday ? 'احتُسب نشاط اليوم.' : 'لم يُحتسب نشاط اليوم بعد.'}</p>
          <p className="mt-2 text-xs text-muted-foreground" data-testid="activity-timezone">
            {activity.timezone ? <>توقيت الحساب الثابت: <bdi>{activity.timezone}</bdi> · يوم الحساب: <bdi>{activity.today}</bdi></> : 'سيُثبَّت توقيت الحساب من توقيت جهازك عند أول جلسة في القارئ.'}
          </p>
        </>
      )}
      <details className="mt-3 text-xs leading-relaxed text-muted-foreground" data-testid="activity-rules">
        <summary className="min-h-8 cursor-pointer font-bold">كيف تُحسب الأيام؟</summary>
        <p>انتقل إلى صفحة أخرى بعد ٣٠ ثانية متصلة في وضع القراءة والنافذة ظاهرة ونشطة، أو حاول التسميع حتى يلتقط التعرّف خمس كلمات نهائية على الأقل بعد خمس ثوانٍ في نافذة نشطة. فتح الصفحة أو تشغيل الميكروفون وحده أو إظهار الكلمات يدوياً لا يكفي.</p>
        <p className="mt-2">نحسب يوم وصول النشاط إلى الخادم مرة واحدة مهما تعددت الجلسات والأجهزة. تبقى السلسلة إذا كان آخر يوم دراسة اليوم أو أمس بتوقيت الحساب؛ تنقطع بعد فوات يوم كامل. التوقيت ثابت حتى عند السفر أو تغيير الجهاز. لا تُستعاد أيام سابقة من مواضع القراءة أو التقارير، ولا تتغير بحفظ التقارير أو استيرادها أو حذفها.</p>
        <p className="mt-2">نحفظ تاريخ اليوم فقط للاستمرارية، وبيانات جلسة مؤقتة للتحقق من المدة ومنع التكرار، دون صوت أو نص مسموع أو أسئلة. هذه إشارة نشاط من القارئ، وليست درجة حفظ أو اعتماد اختبار. عند انقطاع الاتصال لا نضمن احتساب النشاط؛ يظهر خطأ مع خيار إعادة المحاولة.</p>
      </details>
    </section>
  );
}