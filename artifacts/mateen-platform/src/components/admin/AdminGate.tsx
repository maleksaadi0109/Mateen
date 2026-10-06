import { tr } from '@/lib/i18n';
import { LocaleSwitch } from '@/components/mateen/LocaleSwitch';
import { type ReactNode, useEffect, useRef } from 'react';
import { useClerk, useSession } from '@clerk/react';
import { Link, Redirect, useLocation } from 'wouter';
import { LayoutDashboard, Users, BookMarked, History as HistoryIcon, ArrowRight } from 'lucide-react';
import { getGetReviewAccessQueryKey, getGetProfileQueryKey, useGetProfile, useGetReviewAccess } from '@workspace/api-client-react';
import type { ReviewAccess } from '@workspace/api-client-react';
import { ErrorState, Logo, SkeletonBlock } from '@/components/mateen/bits';
import { ReviewSecurity } from '@/components/admin/ReviewSecurity';
import { reviewSignIn } from '@/lib/review-return';
import { errMsg } from '@/lib/admin';
import { useAuthReady } from '@/lib/mateen';
import { cn } from '@/lib/utils';

export type Need = 'any' | 'qualification' | 'content';
export const isReviewer = (a?: ReviewAccess) => !!a && (a.contentReviewer || a.qualificationReviewer);
export const isSecure = (a?: ReviewAccess) => !!a && a.verifiedEmail;
const allowed = (a: ReviewAccess, need: Need) => need === 'any' ? isReviewer(a) : need === 'qualification' ? a.qualificationReviewer : a.contentReviewer;

/** Protected queries mount only after sign-in, trusted scope and verified email. */
export function AdminGate({ need = 'any', children }: { need?: Need; children: (a: ReviewAccess) => ReactNode }) {
  const { isLoaded, isSignedIn, ready } = useAuthReady();
  const [loc] = useLocation();
  const { addListener } = useClerk();
  const { session } = useSession();
  const access = useGetReviewAccess({ query: { enabled: ready, queryKey: [...getGetReviewAccessQueryKey(), session?.id], staleTime: 0, refetchOnMount: 'always', refetchInterval: 60_000 } });
  const refetch = useRef(access.refetch);
  refetch.current = access.refetch;
  useEffect(() => {
    if (!ready) return;
    let last = '';
    return addListener(({ user: u, session: s }) => {
      const signature = JSON.stringify([u?.id, u?.primaryEmailAddress?.verification?.status, s?.id]);
      if (signature !== last) { last = signature; void refetch.current(); }
    });
  }, [ready, addListener]);
  const refresh = () => access.refetch({ throwOnError: true });
  const profile = useGetProfile({ query: { enabled: ready, queryKey: getGetProfileQueryKey() } });
  if (isLoaded && !isSignedIn) return <Redirect to={reviewSignIn(loc)} />;
  const a = access.data;
  const tabs = [
    { href: '/admin', label: tr("نظرة عامة"), I: LayoutDashboard, show: !!a && isReviewer(a), exact: true },
    { href: '/admin/teachers', label: tr("طلبات المعلمين"), I: Users, show: !!a?.qualificationReviewer },
    { href: '/admin/sources', label: tr("مصادر النصوص"), I: BookMarked, show: !!a?.contentReviewer },
    { href: '/admin/scholarly', label: tr("المساعد والشروح"), I: BookMarked, show: !!a?.contentReviewer },
    { href: '/admin/audit', label: tr("سجل المراجعة"), I: HistoryIcon, show: !!a && isReviewer(a) },
  ].filter((t) => t.show);

  let body: ReactNode;
  if (!ready || access.isLoading) body = <div className="space-y-4"><SkeletonBlock className="h-12" /><SkeletonBlock className="h-64" /></div>;
  else if (access.isError || !a) body = <ErrorState message={errMsg(access.error, tr("تعذّر التحقق من صلاحيات المراجعة."))} onRetry={() => access.refetch()} />;
  else if (!isReviewer(a)) body = (
    <div className="paper-card p-8" data-testid="state-not-authorized">
      <h1 className="font-display text-2xl font-bold">{tr("لا تملك صلاحية المراجعة")}</h1>
      <p className="mt-2 font-arabic text-lg leading-loose text-muted-foreground">{tr("لا تُمنح صلاحيات المراجعة من داخل المنصة، وإنما يمنحها مسؤول النظام.")}</p>
    </div>
  );
  else if (!allowed(a, need)) body = (
    <div className="paper-card p-8" data-testid="state-wrong-permission">
      <h1 className="font-display text-2xl font-bold">{tr("هذه الصفحة خارج نطاق صلاحيتك")}</h1>
      <p className="mt-2 font-arabic text-lg leading-loose text-muted-foreground">{tr("صلاحياتك الحالية لا تشمل")}{' '}{need === 'qualification' ? tr("مراجعة مؤهلات المعلمين") : tr("مراجعة المصادر العلمية")}.</p>
    </div>
  );
  else if (!isSecure(a)) body = (
    <div className="space-y-4" data-testid="state-insecure">
      <h1 className="font-display text-2xl font-bold">{tr("وثّق بريدك الإلكتروني لفتح المراجعة")}</h1>
      <ReviewSecurity refresh={refresh} />
    </div>
  );
  else body = children(a);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-5 py-3 md:px-10">
          <Link href="/"><Logo className="h-10" /></Link>
          <span className="rounded-full bg-primary px-3 py-0.5 font-ui text-xs font-bold text-primary-foreground">{tr("مركز المراجعة")}</span>
          <Link href={profile.data?.role === 'teacher' ? '/teacher' : '/student'} className="ms-auto inline-flex items-center gap-1 font-ui text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-portal">
            <ArrowRight size={14} />{' '}{tr("العودة إلى بوابتي")}</Link>
          <LocaleSwitch compact />
        </div>
        {tabs.length ? (
          <nav className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 md:px-9" aria-label={tr("التنقل الإداري")}>
            {tabs.map((t) => {
              const on = t.exact ? loc === t.href : loc.startsWith(t.href);
              return (
                <Link key={t.href} href={t.href} data-testid={`link-admin-${t.href.replace(/\//g, '-')}`} aria-current={on ? 'page' : undefined}
                  className={cn('flex shrink-0 items-center gap-2 rounded-full px-4 py-1.5 font-ui text-sm font-semibold', on ? 'bg-primary text-primary-foreground' : 'text-foreground/75 hover:bg-muted')}>
                  <t.I size={15} /> {t.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8 md:px-10 md:py-10">{body}</main>
    </div>
  );
}
