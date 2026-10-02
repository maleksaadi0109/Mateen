import { useEffect, useRef, useState } from 'react';
import { useClerk, UserProfile } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetProfileQueryKey, getGetDashboardQueryKey, useGetProfile, useSaveProfile } from '@workspace/api-client-react';
import { LogOut, Moon, Sun } from 'lucide-react';
import { ErrorState, LoadingList, PageHeader } from '@/components/mateen/bits';
import { usePortalTheme } from '@/components/portal/PortalShell';
import { usePageMeta } from '@/lib/mateen';
import { useToast } from '@/hooks/use-toast';

export default function SettingsPage() {
  usePageMeta('الإعدادات | مَتِين', 'اسمك وحسابك والمظهر.');
  const profile = useGetProfile({ query: { enabled: true, queryKey: getGetProfileQueryKey() } });
  const save = useSaveProfile();
  const qc = useQueryClient();
  const { signOut } = useClerk();
  const { theme, setTheme } = usePortalTheme();
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
      <PageHeader eyebrow="الإعدادات" title="حسابك" />
      <section className="paper-card p-7">
        <h2 className="font-display text-xl font-bold">الاسم</h2>
        <form className="mt-4 flex flex-wrap gap-3" onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          save.mutate({ data: { name: name.trim(), role: p.role } }, {
            onSuccess: () => { qc.invalidateQueries({ queryKey: getGetProfileQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); toast({ title: 'تم حفظ الاسم' }); },
            onError: () => toast({ title: 'تعذّر الحفظ', variant: 'destructive' }),
          });
        }}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} aria-label="الاسم" className="min-w-0 flex-1 rounded-xl border bg-background px-4 py-3 font-ui outline-none focus:border-secondary" data-testid="input-settings-name" />
          <button disabled={!valid || save.isPending || name.trim() === p.name} className="rounded-full bg-primary px-7 py-3 font-ui font-bold text-primary-foreground disabled:opacity-50" data-testid="button-save-name">{save.isPending ? 'جارٍ الحفظ…' : 'حفظ'}</button>
        </form>
        <p className="mt-3 font-ui text-xs text-muted-foreground">الدور: {p.role === 'teacher' ? 'معلم' : 'طالب'}، ولا يتغير بعد التسجيل.</p>
      </section>
      <section className="paper-card flex flex-wrap items-center justify-between gap-4 p-7">
        <div><h2 className="font-display text-xl font-bold">المظهر</h2><p className="font-arabic text-muted-foreground">فاتح «القرطاس الطبيعي» أو داكن «المخطوطات الليلية».</p></div>
        <div className="flex gap-2">
          <button onClick={() => setTheme('light')} aria-pressed={theme === 'light'} className={`inline-flex items-center gap-2 rounded-full border px-5 py-2.5 font-ui text-sm font-bold ${theme === 'light' ? 'bg-primary text-primary-foreground' : ''}`} data-testid="button-theme-light"><Sun size={15} />فاتح</button>
          <button onClick={() => setTheme('dark')} aria-pressed={theme === 'dark'} className={`inline-flex items-center gap-2 rounded-full border px-5 py-2.5 font-ui text-sm font-bold ${theme === 'dark' ? 'bg-primary text-primary-foreground' : ''}`} data-testid="button-theme-dark"><Moon size={15} />داكن</button>
        </div>
      </section>
      <section className="overflow-x-auto">
        <h2 className="mb-4 font-display text-xl font-bold">إعدادات الأمان والبريد</h2>
        <UserProfile routing="hash" appearance={{ elements: { rootBox: 'w-full', cardBox: 'w-full max-w-full shadow-none border border-[#e6dccf]' } }} />
      </section>
      <button onClick={() => signOut({ redirectUrl: base })} className="inline-flex items-center gap-2 rounded-full border-2 border-destructive/60 px-7 py-3 font-ui font-bold text-foreground hover:bg-muted" data-testid="button-signout-settings"><LogOut size={16} />تسجيل الخروج</button>
    </div>
  );
}
