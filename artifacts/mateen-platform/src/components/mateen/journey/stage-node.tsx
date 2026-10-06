import { fmt } from '@/lib/i18n';
import { tr } from '@/lib/i18n';
import { Link } from 'wouter';
import { Check, Lock } from 'lucide-react';
import type { LearningMapStagesItem } from '@workspace/api-client-react';
import { num } from '@/lib/mateen';

const OFFSETS = [0, 34, 52, 34, 0, -34, -52, -34];

export default function StageNode({ stage, index }: { stage: LearningMapStagesItem; index: number }) {
  const s = stage;
  const x = OFFSETS[index % OFFSETS.length];
  const statusText = s.status === 'passed' ? tr("مجتازة") : s.status === 'current' ? tr("المرحلة الحالية") : tr("مغلقة");
  const disc = (
    <span className="relative grid h-[4.5rem] w-[4.5rem] shrink-0 place-items-center">
      {s.status === 'current' && <span aria-hidden className="journey-ring absolute inset-0 rounded-full bg-secondary/40" />}
      <span className={`relative grid h-full w-full place-items-center rounded-full font-display text-xl font-bold transition-transform duration-200 group-hover:-translate-y-0.5 group-active:translate-y-1 ${
        s.status === 'passed' ? 'bg-primary text-primary-foreground shadow-[0_6px_0_hsl(22_35%_20%)]'
        : s.status === 'current' ? 'bg-secondary text-secondary-foreground shadow-[0_6px_0_hsl(24_90%_20%)] ring-4 ring-card'
        : 'bg-muted text-muted-foreground shadow-[0_6px_0_hsl(30_15%_78%)]'}`}>
        {s.status === 'passed' ? <Check size={28} strokeWidth={3} /> : s.status === 'locked' ? <Lock size={22} /> : num(s.number)}
      </span>
    </span>
  );
  const label = (
    <span className="min-w-0 flex-1">
      <span className="block font-ui text-xs font-semibold text-muted-foreground">{tr("المرحلة")}{' '}{num(s.number)} · {statusText}{s.bestPercent != null && fmt(" · أفضل نتيجة {a}٪", " · best result {a}%", { a: num(s.bestPercent) })}
      </span>
      <span className={`line-clamp-2 font-arabic text-base leading-7 sm:text-lg ${s.status === 'locked' ? 'text-muted-foreground' : 'text-foreground'}`}>{s.title}</span>
    </span>
  );
  const inner = <span className="flex flex-col items-center gap-2 text-center sm:flex-row sm:gap-4 sm:text-start">{disc}{label}</span>;
  return (
    <li id={`stage-${s.number}`} tabIndex={-1} className="relative scroll-mt-28 py-3 focus-visible:rounded-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary" data-testid={`stage-${s.number}`} data-status={s.status}>
      <div className="mx-auto w-[calc(100%-7rem)] max-w-[22rem] transition-transform" style={{ transform: `translateX(${x}px)` }}>
        {s.status === 'locked'
          ? <div aria-disabled="true" aria-label={fmt("المرحلة {a}: {b} — مغلقة", "Stage {a}: {b} — locked", { a: num(s.number), b: s.title })} className="rounded-3xl p-1 opacity-75">{inner}</div>
          : <Link href={`/student/learn/nawawi/${s.number}`} aria-label={fmt("المرحلة {a}: {b} — {c}", "Stage {a}: {b} — {c}", { a: num(s.number), b: s.title, c: statusText })} className="group block rounded-3xl p-1" data-testid={`link-stage-${s.number}`}>{inner}</Link>}
      </div>
    </li>
  );
}
