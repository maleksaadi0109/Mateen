import { tr } from '@/lib/i18n';
import { type ReactNode, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import logoPath from '@assets/MateeeeeeeeenLOGO_1790090010886.png';
import { cn } from '@/lib/utils';

export function Logo({ className = 'h-12' }: { className?: string }) {
  return <img src={logoPath} alt={tr("مَتِين")} className={cn('brand-logo w-auto object-contain', className)} data-testid="img-logo" />;
}
export { logoPath };

export function StarMark({ className = '', size = 24 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 72 72" width={size} height={size} className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M36 4l8 13 15-4-4 15 13 8-13 8 4 15-15-4-8 13-8-13-15 4 4-15-13-8 13-8-4-15 15 4z" />
      <circle cx="36" cy="36" r="6" />
    </svg>
  );
}

export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Ornament({ children }: { children?: ReactNode }) {
  return (
    <div className="ornament" aria-hidden={!children}>
      {children ?? <StarMark size={18} />}
    </div>
  );
}

export function SkeletonBlock({ className = 'h-24' }: { className?: string }) {
  return <div className={cn('skel w-full', className)} aria-hidden="true" />;
}

export function LoadingList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4" role="status" aria-label={tr("جارٍ التحميل")} data-testid="status-loading">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} className="h-28" />
      ))}
    </div>
  );
}

export function ErrorState({ message = tr("تعذّر تحميل البيانات."), onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="paper-card flex flex-col items-center gap-4 p-10 text-center" role="alert" data-testid="status-error">
      <AlertTriangle className="text-secondary" size={32} />
      <p className="font-ui text-foreground">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-ui text-sm font-semibold text-primary-foreground" data-testid="button-retry">
          <RefreshCw size={15} />{' '}{tr("إعادة المحاولة")}</button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="paper-card star-pattern relative overflow-hidden p-10 text-center md:p-14" data-testid="status-empty">
      <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full border border-secondary/30 bg-card text-secondary">{icon ?? <StarMark size={30} />}</div>
      <h3 className="font-display text-xl font-bold">{title}</h3>
      {children && <p className="mx-auto mt-3 max-w-md font-arabic text-lg leading-loose text-muted-foreground">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Notice({ tone = 'amber', title, children }: { tone?: 'amber' | 'brown'; title: string; children: ReactNode }) {
  return (
    <div
      className={cn('rounded-2xl border p-5', tone === 'amber' ? 'border-secondary/40 bg-secondary/10' : 'border-primary/30 bg-primary/10')}
      role="note"
      data-testid="notice-box"
    >
      <p className="font-display font-bold text-foreground">{title}</p>
      <p className="mt-1.5 font-arabic text-base leading-loose text-foreground/85">{children}</p>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-8">
      {eyebrow && <p className="mb-2 font-ui text-sm font-semibold text-secondary">{eyebrow}</p>}
      <h1 className="font-display text-3xl font-bold leading-tight md:text-4xl" data-testid="text-page-title">{title}</h1>
      {children && <p className="mt-3 max-w-2xl font-arabic text-lg leading-loose text-muted-foreground">{children}</p>}
    </header>
  );
}

export function useLocalNumber(key: string, initial: number) {
  const [v, setV] = useState<number>(() => {
    const raw = typeof window !== 'undefined' ? Number(localStorage.getItem(key)) : 0;
    return raw > 0 ? raw : initial;
  });
  useEffect(() => {
    localStorage.setItem(key, String(v));
  }, [key, v]);
  return [v, setV] as const;
}
