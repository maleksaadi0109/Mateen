import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { Link, Redirect, useLocation } from 'wouter';
import { useClerk } from '@clerk/react';
import {
  LayoutDashboard, Library, ClipboardCheck, ScrollText, MessageSquare, Sparkles, Settings, LogOut, Moon, Sun, FileText, ShieldCheck,
} from 'lucide-react';
import { getGetProfileQueryKey, getGetReviewAccessQueryKey, getGetAssessmentReviewerAccessQueryKey, useGetProfile, useGetReviewAccess, useGetAssessmentReviewerAccess } from '@workspace/api-client-react';
import { Logo, ErrorState, SkeletonBlock } from '@/components/mateen/bits';
import { useAuthReady } from '@/lib/mateen';
import { cn } from '@/lib/utils';
import { PortalNotifications } from './PortalNotifications';

type Theme = 'light' | 'dark';
const ThemeCtx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({ theme: 'light', setTheme: () => {} });
export const usePortalTheme = () => useContext(ThemeCtx);

const studentNav = [
  { href: '/student', label: 'الرئيسية', icon: LayoutDashboard, exact: true },
  { href: '/student/tracks', label: 'المسارات', icon: Library },
  { href: '/student/scholars', label: 'المشايخ', icon: ScrollText },
  { href: '/student/messages', label: 'الرسائل', icon: MessageSquare },
  { href: '/student/assistant', label: 'المساعد العلمي', icon: Sparkles },
  { href: '/student/settings', label: 'الإعدادات', icon: Settings },
];
const teacherNav = [
  { href: '/teacher/overview', label: 'نشاط الإحالات', icon: LayoutDashboard, exact: true },
  { href: '/teacher', label: 'الملف والطلب', icon: FileText, exact: true },
  { href: '/teacher/messages', label: 'الرسائل', icon: MessageSquare },
  { href: '/teacher/settings', label: 'الإعدادات', icon: Settings },
];

export function PortalGate({ role, children }: { role: 'student' | 'teacher'; children: ReactNode }) {
  const { isLoaded, isSignedIn, ready } = useAuthReady();
  const profile = useGetProfile({ query: { enabled: ready, queryKey: getGetProfileQueryKey() } });
  const reviewer = useGetAssessmentReviewerAccess({ query: { enabled: ready, queryKey: getGetAssessmentReviewerAccessQueryKey() } });
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem('mateen-theme') === 'dark' ? 'dark' : 'light'));
  const setTheme = (t: Theme) => { localStorage.setItem('mateen-theme', t); setThemeState(t); };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    return () => document.documentElement.classList.remove('dark');
  }, [theme]);

  if (isLoaded && !isSignedIn) return <Redirect to="/sign-in" />;
  if (!isLoaded || profile.isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background p-8"><div className="mx-auto max-w-3xl space-y-4 pt-16"><SkeletonBlock className="h-12" /><SkeletonBlock className="h-64" /></div></div>
    );
  }
  if (profile.isError || !profile.data) {
    return <div className="grid min-h-[100dvh] place-items-center bg-background p-6"><ErrorState message="تعذّر التحقق من حسابك." onRetry={() => profile.refetch()} /></div>;
  }
  if (!profile.data.onboarded) return <Redirect to="/onboarding" />;
  if (profile.data.role !== role) return <Redirect to={profile.data.role === 'teacher' ? '/teacher' : '/student'} />;

  const base0 = role === 'student' ? studentNav : teacherNav;
  const nav = reviewer.data?.authorized ? [...base0, { href: '/admin/assessments', label: 'مراجعة الاختبارات', icon: ClipboardCheck }] : base0;
  return (
    <ThemeCtx.Provider value={{ theme, setTheme }}>
      <Shell nav={nav} name={profile.data.name} role={role}>{children}</Shell>
    </ThemeCtx.Provider>
  );
}

function Shell({ nav: navProp, name, role, children }: { nav: typeof studentNav; name: string; role: string; children: ReactNode }) {
  let nav = navProp;
  const [loc] = useLocation();
  const { signOut } = useClerk();
  const { theme, setTheme } = usePortalTheme();
  const access = useGetReviewAccess({ query: { enabled: true, queryKey: getGetReviewAccessQueryKey() } });
  if (access.data && (access.data.contentReviewer || access.data.qualificationReviewer) && !nav.some((x) => x.href === '/admin')) {
    nav = [...nav, { href: '/admin', label: 'مركز المراجعة', icon: ShieldCheck }];
  }
  const active = (n: (typeof nav)[number]) => (n.exact ? loc === n.href : loc.startsWith(n.href));
  const base = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';
  // Focused reading route: no portal chrome, just the book.
  if (role === 'student' && loc.startsWith('/student/study/') && loc !== '/student/study/reports') {
    return (
      <div className="min-h-[100dvh] bg-background text-foreground" data-testid="focused-study-shell">
        <main className="mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-5">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-var(--mateen-assistant-height))] bg-background text-foreground [--mateen-nav-height:5.5625rem] md:flex md:[--mateen-nav-height:0rem]">
      <aside className="hidden w-72 shrink-0 flex-col border-l bg-card p-6 md:sticky md:top-[var(--mateen-assistant-height)] md:flex md:h-[calc(100dvh-var(--mateen-assistant-height))]">
        <Link href={role === 'student' ? '/student' : '/teacher'} className="mb-8 block"><Logo className="h-14" /></Link>
        <nav className="flex-1 space-y-1" aria-label="التنقل الرئيسي">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} data-testid={`link-nav-${n.href.replace(/\//g, '-')}`}
              className={cn('flex items-center gap-3 rounded-xl px-4 py-2.5 font-ui text-sm font-semibold transition-colors',
                active(n) ? 'bg-primary text-primary-foreground' : 'text-foreground/75 hover:bg-muted')}
              aria-current={active(n) ? 'page' : undefined}>
              <n.icon size={18} /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="space-y-3 border-t pt-4">
          <p className="truncate font-ui text-sm text-muted-foreground" data-testid="text-user-name">{name}</p>
          <div className="flex gap-2">
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 font-ui text-xs font-semibold hover:bg-muted" data-testid="button-theme">
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />} {theme === 'dark' ? 'مظهر فاتح' : 'مظهر داكن'}
            </button>
            <button onClick={() => signOut({ redirectUrl: base })} className="flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 font-ui text-xs font-semibold hover:bg-muted" data-testid="button-signout">
              <LogOut size={15} /> خروج
            </button>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="sticky top-[var(--mateen-assistant-height)] z-30 border-b bg-background/90 backdrop-blur md:hidden">
          <div className="flex items-center justify-between px-4 py-2"><Logo className="h-9" />
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="rounded-full border p-2" aria-label="تبديل المظهر" data-testid="button-theme-mobile">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2" aria-label="التنقل الرئيسي">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className={cn('flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 font-ui text-xs font-semibold', active(n) ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground/75')}>
                <n.icon size={14} /> {n.label}
              </Link>
            ))}
          </nav>
        </div>
        <main className="mx-auto max-w-5xl px-5 py-8 md:px-10 md:py-12">
          <PortalNotifications teacher={role === 'teacher'} />
          {children}
        </main>
      </div>
    </div>
  );
}
