import { tr } from '@/lib/i18n';
import { useEffect, useRef, useState } from 'react';
import { useClerk, useUser } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetProfileQueryKey, getGetDashboardQueryKey, useGetProfile, useSaveProfile } from '@workspace/api-client-react';
import { LogOut, Mail, Moon, Sun } from 'lucide-react';
import { ErrorState, LoadingList, PageHeader } from '@/components/mateen/bits';
import { usePortalTheme } from '@/components/portal/PortalShell';
import { usePageMeta } from '@/lib/mateen';
import { useToast } from '@/hooks/use-toast';
import LearningPreferencesSettings from '@/components/mateen/learning-preferences-settings';

export default function SettingsPage() {
  const { user } = useUser();
  return <AccountSettings key={user?.id ?? 'anon'} />;
}

function AccountSettings() {
  usePageMeta(tr("الإعدادات | مَتِين"), tr("اسمك وتفضيلات تعلّمك وحسابك والمظهر."));
  const profile = useGetProfile({ query: { enabled: true, queryKey: getGetProfileQueryKey() } });
  const save = useSaveProfile();
  const qc = useQueryClient();
  const { signOut, openUserProfile } = useClerk();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? '';
  const { theme, setTheme } = usePortalTheme();
  const manageAccount = () => openUserProfile({
    appearance: {
      variables: {
        colorBackground: theme === 'dark' ? '#251f1a' : '#fffdf8',
        colorInput: theme === 'dark' ? '#1c1814' : '#fdf9f3',
        colorForeground: theme === 'dark' ? '#f4e9dd' : '#3a2a22',
        colorInputForeground: theme === 'dark' ? '#f4e9dd' : '#3a2a22',
        colorMutedForeground: theme === 'dark' ? '#c3ad99' : '#6b5a50',
        colorPrimary: theme === 'dark' ? '#dca76e' : '#994703',
      },
      elements: {
        rootBox: '!w-full !max-w-full !min-w-0',
        cardBox: '!w-[calc(100vw-2rem)] sm:!w-[min(960px,calc(100vw-2rem))] !max-w-full !min-w-0 !rounded-3xl !bg-card',
        card: '!flex !flex-col sm:!flex-row !w-full !min-w-0 !shadow-none !border-0 !bg-transparent',
        navbar: '!relative !inset-auto !flex !h-auto !min-h-0 !w-full !max-w-full !transform-none !rounded-none !border-0 !bg-card !p-3 sm:!h-full sm:!w-52 sm:!p-6',
        navbarButtons: '!flex !flex-row !flex-wrap !gap-2 sm:!flex-col',
        navbarMobileMenuRow: '!hidden',
        pageScrollBox: '!w-full !min-w-0 !max-w-full',
        headerTitle: 'font-bold !text-foreground',
        headerSubtitle: '!text-muted-foreground',
        formFieldLabel: '!text-foreground font-semibold',
        formFieldInput: 'min-h-11 text-base !bg-background !text-foreground',
        footerActionLink: '!text-secondary font-bold',
        footerActionText: '!text-muted-foreground',
      },
    },
  });
  const { toast } = useToast();
  const [name, setName] = useState('');
  const inited = useRef(false);
  useEffect(() => { if (profile.data && !inited.current) { inited.current = true; setName(profile.data.name); } }, [profile.data]);
  const base = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

  if (profile.isLoading) return <LoadingList />;
  if (profile.isError || !profile.data) return <ErrorState onRetry={() => profile.refetch()} />;
  const p = profile.data;
  const valid = name.trim().length >= 2;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={tr("الإعدادات")} title={tr("حسابك")} />
      <section className="paper-card p-5 sm:p-7">
        <h2 className="font-display text-xl font-bold">{tr("الاسم")}</h2>
        <form className="mt-4 flex flex-wrap gap-3" onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          save.mutate({ data: { name: name.trim(), role: p.role } }, {
            onSuccess: (updated) => { qc.setQueryData(getGetProfileQueryKey(), updated); qc.invalidateQueries({ queryKey: getGetProfileQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); toast({ title: tr("تم حفظ الاسم") }); },
            onError: () => toast({ title: tr("تعذّر الحفظ"), variant: 'destructive' }),
          });
        }}>
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={save.isPending} maxLength={100} aria-label={tr("الاسم")} className="min-w-0 flex-1 rounded-xl border bg-background px-4 py-3 font-ui outline-none focus:border-secondary" data-testid="input-settings-name" />
          <button disabled={!valid || save.isPending || name.trim() === p.name} className="rounded-full bg-primary px-7 py-3 font-ui font-bold text-primary-foreground disabled:opacity-50" data-testid="button-save-name">{save.isPending ? tr("جارٍ الحفظ…") : tr("حفظ")}</button>
        </form>
        <p className="mt-3 font-ui text-xs text-muted-foreground">{tr("الدور:")}{' '}{p.role === 'teacher' ? tr("معلم") : tr("طالب")}{tr("، ولا يتغير بعد التسجيل.")}</p>
      </section>
      {p.role === 'student' && <LearningPreferencesSettings key={p.id} profile={p} save={save} onSaved={(updated) => {
        qc.setQueryData(getGetProfileQueryKey(), updated);
        qc.invalidateQueries({ queryKey: getGetProfileQueryKey() });
      }} />}
      <section className="paper-card flex flex-wrap items-center justify-between gap-4 p-5 sm:p-7">
        <div><h2 className="font-display text-xl font-bold">{tr("المظهر")}</h2><p className="font-arabic text-muted-foreground">{tr("فاتح «القرطاس الطبيعي» أو داكن «المخطوطات الليلية».")}</p></div>
        <div className="flex gap-2">
          <button onClick={() => setTheme('light')} aria-pressed={theme === 'light'} className={`inline-flex items-center gap-2 rounded-full border px-5 py-2.5 font-ui text-sm font-bold ${theme === 'light' ? 'bg-primary text-primary-foreground' : ''}`} data-testid="button-theme-light"><Sun size={15} />{tr("فاتح")}</button>
          <button onClick={() => setTheme('dark')} aria-pressed={theme === 'dark'} className={`inline-flex items-center gap-2 rounded-full border px-5 py-2.5 font-ui text-sm font-bold ${theme === 'dark' ? 'bg-primary text-primary-foreground' : ''}`} data-testid="button-theme-dark"><Moon size={15} />{tr("داكن")}</button>
        </div>
      </section>
      <section className="paper-card min-w-0 p-5 sm:p-7" aria-labelledby="account-security-title">
        <h2 id="account-security-title" className="font-display text-xl font-bold">{tr("البريد والأمان")}</h2>
        <p className="mt-2 break-words font-arabic text-muted-foreground">{tr("تُدار عناوين البريد وكلمة المرور والجلسات من نافذة الحساب الآمنة.")}</p>
        <p className="mt-3 break-all font-ui text-sm" dir="ltr" data-testid="text-account-email">{email}</p>
        <div className="mt-4">
          <button type="button" onClick={manageAccount} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border px-6 py-2.5 font-ui text-sm font-bold hover:bg-muted sm:w-auto" data-testid="button-manage-account"><Mail size={16} />{tr("إدارة البريد وأمان الحساب")}</button>
        </div>
      </section>
      <button onClick={() => signOut({ redirectUrl: base })} className="inline-flex items-center gap-2 rounded-full border-2 border-destructive/60 px-7 py-3 font-ui font-bold text-foreground hover:bg-muted" data-testid="button-signout-settings"><LogOut size={16} />{tr("تسجيل الخروج")}</button>
    </div>
  );
}
