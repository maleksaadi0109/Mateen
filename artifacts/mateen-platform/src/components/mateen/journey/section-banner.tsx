import { num } from '@/lib/mateen';

export default function SectionBanner({ from, to, passed, total }: { from: number; to: number; passed: number; total: number }) {
  return (
    <li className="list-none py-4" aria-label={`الأحاديث ${num(from)} إلى ${num(to)}`}>
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-primary px-5 py-3 text-primary-foreground shadow-[0_5px_0_hsl(22_35%_20%)]">
        <div>
          <p className="font-ui text-[11px] font-semibold opacity-75">الأحاديث {num(from)} – {num(to)}</p>
          <p className="font-display text-base font-bold">{passed === total ? 'منزلة مكتملة' : passed ? 'في الطريق' : 'منزلة قادمة'}</p>
        </div>
        <span className="rounded-full bg-primary-foreground/15 px-3 py-1 font-ui text-xs font-bold">{num(passed)} / {num(total)}</span>
      </div>
    </li>
  );
}
