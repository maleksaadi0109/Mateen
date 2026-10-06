import { tr } from '@/lib/i18n';
type Mode = 'study' | 'sources';
const blockers: Record<string, string> = {
  get no_sources() { return tr("لا توجد مصادر مؤهلة حالياً."); },
  get corpus_incomplete() { return tr("المصادر تتجاوز حدود الاسترجاع الآمن."); },
  get provider_unconfigured() { return tr("مزوّد الإجابة غير مهيأ."); },
  get evaluation_required() { return tr("تقييم النموذج والمصادر الحالية لم يجتز شروط الإتاحة."); },
};

export function AnswerModeControl({ value, onChange, disabled, sourceBlockers, covered }: {
  value: Mode; onChange: (mode: Mode) => void; disabled: boolean;
  sourceBlockers: string[]; covered: boolean;
}) {
  return <div className="mb-2 space-y-2">
    <div role="group" aria-label={tr("وضع الإجابة")} className="flex flex-wrap gap-2">
      {(['study', 'sources'] as const).map(mode => <button key={mode} type="button"
        disabled={disabled} aria-pressed={value === mode} data-testid={`mode-${mode}`}
        onClick={() => onChange(mode)}
        className={`rounded-full border px-3 py-1.5 font-ui text-xs disabled:opacity-50 ${value === mode ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>
        {mode === 'study' ? tr("شرح تعليمي") : tr("الإجابة من المصادر")}
      </button>)}
    </div>
    <p className="font-ui text-xs leading-relaxed text-muted-foreground" data-testid="mode-notice">
      {value === 'study' ? tr("شرح آلي غير مراجع علمياً، وقد يخطئ.") :
        tr("اقتباسات حرفية من مقاطع مسترجعة؛ ليست شرحاً بشرياً معتمداً. لن يتحول هذا الوضع تلقائياً إلى الشرح العام.")}
    </p>
    {value === 'sources' && <p role="status" className="font-ui text-xs leading-relaxed text-muted-foreground" data-testid="source-readiness">
      {sourceBlockers.map(b => blockers[b]).filter(Boolean).join(' ')}
      {!covered && tr(" لا توجد مقاطع مؤهلة للكتاب المحدد؛ اختيار الكتاب لا يعني توفر مصادره.")}
      {sourceBlockers.length === 0 && covered && tr("البحث متاح ضمن المقاطع المؤهلة فقط؛ قد لا يجد دليلاً لسؤالك.")}
    </p>}
  </div>;
}
