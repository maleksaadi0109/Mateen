import { tr } from '@/lib/i18n';
import { LocaleSwitch } from '@/components/mateen/LocaleSwitch';
import { type ComponentType, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Library, LayoutDashboard, MessageSquare, Sparkles, FileText, MoreHorizontal, X, LogOut, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetClose } from '@/components/ui/sheet';

export type DockNavItem = { href: string; label: string; icon: ComponentType<{ size?: number }>; exact?: boolean };

const studentPrimary: DockNavItem[] = [
  { href: '/student', get label() { return tr("الرئيسية"); }, icon: LayoutDashboard, exact: true },
  { href: '/student/tracks', get label() { return tr("المسارات"); }, icon: Library },
  { href: '/student/messages', get label() { return tr("الرسائل"); }, icon: MessageSquare },
  { href: '/student/assistant', get label() { return tr("المساعد"); }, icon: Sparkles },
];
const teacherPrimary: DockNavItem[] = [
  { href: '/teacher/overview', get label() { return tr("الإحالات"); }, icon: LayoutDashboard, exact: true },
  { href: '/teacher', get label() { return tr("الملف"); }, icon: FileText, exact: true },
  { href: '/teacher/messages', get label() { return tr("الرسائل"); }, icon: MessageSquare },
];

export function MobileDock({ nav, role, theme, onToggleTheme, onSignOut }: {
  nav: DockNavItem[]; role: 'student' | 'teacher' | string; theme: 'light' | 'dark'; onToggleTheme: () => void; onSignOut: () => void;
}) {
  const [loc] = useLocation();
  const [open, setOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const primary = role === 'student' ? studentPrimary : teacherPrimary;
  const primaryHrefs = primary.map((p) => p.href);
  const more = nav.filter((n) => !primaryHrefs.includes(n.href));
  const isActive = (n: DockNavItem) => {
    if (n.href === '/student/tracks') return loc.startsWith('/student/tracks') || loc.startsWith('/student/learn');
    return n.exact ? loc === n.href : loc.startsWith(n.href);
  };
  const moreActive = more.some((n) => loc.startsWith(n.href) && !(n.exact && loc !== n.href));

  useEffect(() => { setOpen(false); }, [loc]);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = () => { if (media.matches) setOpen(false); };
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, []);

  const tab = 'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 font-ui text-[0.8125rem] font-bold leading-tight transition-colors';
  return (
    <>
      <nav className="mateen-dock fixed inset-x-0 bottom-0 z-50 border-t bg-card/95 px-2 pt-1.5 backdrop-blur md:hidden" aria-label={tr("التنقل الرئيسي")} data-testid="nav-mobile-dock">
        <div className="mx-auto flex max-w-lg items-stretch gap-1">
          {primary.map((n) => (
            <Link key={n.href} href={n.href} data-testid={`link-dock-${n.href.replace(/\//g, '-')}`} aria-current={isActive(n) ? 'page' : undefined}
              className={cn(tab, isActive(n) ? 'bg-secondary/12 text-secondary' : 'text-foreground/70 active:bg-muted')}>
              <n.icon size={24} />
              <span>{n.label}</span>
            </Link>
          ))}
          {more.length > 0 && (
            <button ref={moreRef} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} data-testid="button-dock-more"
              className={cn(tab, moreActive ? 'bg-secondary/12 text-secondary' : 'text-foreground/70 active:bg-muted')}>
              <MoreHorizontal size={24} />
              <span>{tr("المزيد")}</span>
            </button>
          )}
        </div>
      </nav>
      <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" data-testid="sheet-more"
            onCloseAutoFocus={(event) => { event.preventDefault(); moreRef.current?.focus(); }}
            className="mateen-sheet max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-card p-4 shadow-2xl [&>button]:hidden">
            <div className="mb-3 flex items-center justify-between">
              <SheetTitle className="text-lg font-bold">{tr("المزيد")}</SheetTitle>
              <SheetClose asChild><button type="button" aria-label={tr("إغلاق القائمة")} data-testid="button-more-close"
                className="grid size-11 place-items-center rounded-full border"><X size={20} /></button>
              </SheetClose>
            </div>
            <SheetDescription className="sr-only">{tr("الأقسام الإضافية وخيارات الحساب والمظهر.")}</SheetDescription>
            <ul className="space-y-1">
              {more.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} onClick={() => setOpen(false)} data-testid={`link-more-${n.href.replace(/\//g, '-')}`} aria-current={isActive(n) ? 'page' : undefined}
                    className={cn('flex min-h-12 items-center gap-3 rounded-2xl px-4 font-ui text-base font-semibold', isActive(n) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                    <n.icon size={22} /> {n.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-center border-t pt-3"><LocaleSwitch /></div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3">
              <button type="button" onClick={onToggleTheme} data-testid="button-theme-sheet" className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border font-ui text-sm font-semibold">
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />} {theme === 'dark' ? tr("مظهر فاتح") : tr("مظهر داكن")}
              </button>
              <button type="button" onClick={onSignOut} data-testid="button-signout-sheet" className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border font-ui text-sm font-semibold">
                <LogOut size={18} />{' '}{tr("خروج")}</button>
            </div>
          </SheetContent>
      </Sheet>
    </>
  );
}
