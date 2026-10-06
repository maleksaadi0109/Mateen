import { tr } from '@/lib/i18n';
import { useEffect, useRef, useState } from 'react';
import { Redirect, useLocation } from 'wouter';
import { useUser } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetProfileQueryKey, getGetDashboardQueryKey, getGetProgressQueryKey, getGetTeacherQueryKey, getGetReferralsQueryKey,
  useGetProfile, useSaveProfile,
} from '@workspace/api-client-react';
import { BookOpen, ScrollText } from 'lucide-react';
import { AuthFrame } from '@/components/mateen/AuthFrame';
import { ErrorState, SkeletonBlock } from '@/components/mateen/bits';
import { TEACHER_INTENT_KEY, usePageMeta, useAuthReady } from '@/lib/mateen';
import OnboardingAssistant, { type Answers } from '@/components/mateen/onboarding-assistant';
import BookMascot from '@/components/mateen/book-mascot';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export default function OnboardingPage() {
  const { user } = useUser();
  return <OnboardingFlow key={user?.id ?? 'anon'} />;
}

function OnboardingFlow() {
  usePageMeta(tr("إكمال الحساب | مَتِين"), tr("اختر اسمك ودورك في المنصة."));
  const { isLoaded, isSignedIn, ready } = useAuthReady();
  const { user } = useUser();
  const [chat, setChat] = useState(false);
  const busy = useRef(false);
  const profile = useGetProfile({ query: { enabled: ready, queryKey: getGetProfileQueryKey() } });
  const save = useSaveProfile();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [role, setRole] = useState<'student' | 'teacher'>(() => (sessionStorage.getItem(TEACHER_INTENT_KEY) === 'teacher' ? 'teacher' : 'student'));
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!touched) setName(profile.data?.name || user?.fullName || user?.firstName || '');
  }, [profile.data, user, touched]);

  if (isLoaded && !isSignedIn) return <Redirect to="/sign-in" />;
  if (!ready || profile.isPending) return <AuthFrame><div className="paper-card mx-auto w-full max-w-xl p-8"><SkeletonBlock className="h-64" /></div></AuthFrame>;
  if (profile.data?.onboarded) return <Redirect to={profile.data.role === 'teacher' ? '/teacher' : '/student'} />;

  const valid = name.trim().length >= 2 && name.trim().length <= 100;
  const doSave = (learningPreferences?: Answers) => {
    if (busy.current || !valid) return;
    busy.current = true;
    save.mutate({ data: { name: name.trim(), role, ...(learningPreferences ? { learningPreferences } : {}) } }, {
      onSuccess: (p) => {
        sessionStorage.removeItem(TEACHER_INTENT_KEY);
        qc.setQueryData(getGetProfileQueryKey(), p);
        [getGetProfileQueryKey(), getGetDashboardQueryKey(), getGetProgressQueryKey(), getGetTeacherQueryKey(), getGetReferralsQueryKey()].forEach((k) => qc.invalidateQueries({ queryKey: k }));
        setLocation(p.role === 'teacher' ? '/teacher' : '/student/tracks');
      },
      onError: () => { busy.current = false; toast({ title: tr("تعذّر حفظ البيانات"), description: tr("حاول مرة أخرى."), variant: 'destructive' }); },
    });
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    if (role === 'teacher') doSave(); else setChat(true);
  };

  const roles = [
    { v: 'student' as const, t: tr("طالب علم"), d: tr("أدرس المتون المتاحة وأتابع موضع توقفي وعلاماتي."), I: BookOpen },
    { v: 'teacher' as const, t: tr("معلم"), d: tr("أقدّم ملفي ووثائقي الخاصة للمراجعة. لا أستقبل إحالات قبل الاعتماد."), I: ScrollText },
  ];

  if (chat && role === 'student') return <AuthFrame><OnboardingAssistant name={name.trim()} saving={save.isPending} error={save.isError} onSave={doSave} onBack={() => setChat(false)} /></AuthFrame>;

  return (
    <AuthFrame>
      <form onSubmit={submit} className="paper-card mx-auto w-full max-w-xl p-8 md:p-10" data-testid="form-onboarding">
        <div className="flex items-start gap-4">
          <BookMascot size={80} mood="cheer" className="shrink-0" />
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold">{tr("أهلاً، أنا مَتِين")}</h1>
            <p className="mt-2 font-arabic text-lg text-muted-foreground">{tr("مساعدك في رحلة التعلّم. دعنا نتعرّف عليك أولاً، ثم أسألك عن حفظك وهدفك.")}</p>
          </div>
        </div>
        {profile.isLoading ? <div className="mt-8"><SkeletonBlock className="h-40" /></div> : profile.isError ? <div className="mt-8"><ErrorState onRetry={() => profile.refetch()} /></div> : (
          <>
            <label className="mt-8 block font-ui text-sm font-bold" htmlFor="name">{tr("كيف تحب أن أناديك؟")}</label>
            <input id="name" value={name} onChange={(e) => { setTouched(true); setName(e.target.value); }} maxLength={100} placeholder={tr("الاسم كما تحب أن يظهر")}
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 font-ui outline-none focus:border-secondary" data-testid="input-name" />
            {!valid && touched && <p className="mt-1 font-ui text-sm text-secondary">{tr("أدخل اسماً من حرفين على الأقل.")}</p>}
            <fieldset className="mt-6">
              <legend className="font-ui text-sm font-bold">{tr("أنا")}</legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {roles.map((r) => (
                  <button type="button" key={r.v} onClick={() => setRole(r.v)} aria-pressed={role === r.v} data-testid={`button-role-${r.v}`}
                    className={cn('rounded-2xl border-2 p-5 text-start transition', role === r.v ? 'border-secondary bg-secondary/10' : 'border-border hover:border-primary/40')}>
                    <r.I className="mb-3 text-secondary" size={24} />
                    <p className="font-display font-bold">{r.t}</p>
                    <p className="mt-1 font-arabic text-sm leading-relaxed text-muted-foreground">{r.d}</p>
                  </button>
                ))}
              </div>
              <p className="mt-3 font-ui text-xs text-muted-foreground">{tr("لا يمكن تغيير الدور بعد الحفظ.")}</p>
            </fieldset>
            <button type="submit" disabled={!valid || save.isPending} className="mt-8 w-full rounded-full bg-secondary py-3.5 font-ui font-bold text-secondary-foreground transition disabled:opacity-50" data-testid="button-onboarding-submit">
              {save.isPending ? tr("جارٍ الحفظ…") : tr("متابعة")}
            </button>
            {!valid && <p className="mt-2 text-center font-ui text-xs text-muted-foreground">{tr("يتفعّل الزر بعد إدخال اسم صحيح.")}</p>}
          </>
        )}
      </form>
    </AuthFrame>
  );
}
