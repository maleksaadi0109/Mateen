import { Languages } from 'lucide-react';
import { useLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Persistent AR/EN toggle. Changing locale re-renders in place: no remount, drafts and session kept. */
export function LocaleSwitch({ className, compact }: { className?: string; compact?: boolean }) {
  const { locale, setLocale } = useLocale();
  return (
    // i18n-canonical: each language label is shown in its own script
    <div role="group" aria-label={locale === 'ar' ? 'لغة الواجهة' : 'Interface language'} data-testid="locale-switch"
      className={cn('inline-flex items-center gap-0.5 rounded-full border border-primary/25 bg-background/80 p-0.5 font-ui text-xs font-bold', className)}>
      {!compact && <Languages size={14} className="mx-1.5 text-secondary" aria-hidden="true" />}
      {(['ar', 'en'] as const).map((l) => (
        <button key={l} type="button" onClick={() => setLocale(l)} aria-pressed={locale === l} lang={l} data-testid={`button-locale-${l}`}
          className={cn('min-h-8 min-w-9 rounded-full px-2.5 transition-colors', locale === l ? 'bg-primary text-primary-foreground' : 'text-foreground/70 hover:bg-muted')}>
          {/* i18n-canonical */}
          {l === 'ar' ? 'ع' : 'EN'}
        </button>
      ))}
    </div>
  );
}
