import { useEffect, useRef } from 'react';
import { ClerkProvider, SignIn, SignUp, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { arSA } from '@clerk/localizations';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { Toaster } from '@/components/ui/toaster';
import { AuthFrame } from '@/components/mateen/AuthFrame';
import { PortalGate } from '@/components/portal/PortalShell';
import { usePageMeta } from '@/lib/mateen';
import AboutPage from '@/pages/about';
import OnboardingPage from '@/pages/onboarding';
import NotFound from '@/pages/not-found';
import StudentHome from '@/pages/student/home';
import TracksPage from '@/pages/student/tracks';
import StudyReaderPage from '@/pages/student/study-reader';
import StudyLibraryPage from '@/pages/student/study-library';
import StudyReportsPage from '@/pages/student/study-reports';
import LearningMapPage from '@/pages/student/learning-map';
import LearningStagePage from '@/pages/student/learning-stage';
import ReviewsPage from '@/pages/student/reviews';
import ScholarsPage from '@/pages/student/scholars';
import ScholarProfilePage from '@/pages/student/scholar-profile';
import MessagesPage from '@/pages/student/messages';
import AssistantPage from '@/pages/student/assistant';
import ScholarlyAdminPage from '@/pages/admin/scholarly';
import TeacherOverview from '@/components/scholarly/TeacherOverview';
import SettingsPage from '@/pages/settings';
import TeacherHome from '@/pages/teacher/home';
import AdminHome from '@/pages/admin';
import AdminTeachers from '@/pages/admin/teachers';
import AdminSources from '@/pages/admin/sources';
import AdminAudit from '@/pages/admin/audit';
import HomeGate from '@/pages/home-gate';
import { claimAssessmentStorage } from '@/lib/assessment';
import ExamsPage from '@/pages/student/exams';
import ExamAttemptPage from '@/pages/student/exam-attempt';
import AdminAssessments from '@/pages/admin/assessments';

const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } } });

const mateenLocale = {
  ...arSA,
  formFieldInputPlaceholder__emailAddress: 'أدخل بريدك الإلكتروني',
  formFieldInputPlaceholder__password: 'أدخل كلمة المرور',
  formFieldInputPlaceholder__signUpPassword: 'اختر كلمة مرور آمنة',
  formFieldInputPlaceholder__firstName: 'الاسم الأول',
  formFieldInputPlaceholder__lastName: 'اسم العائلة',
  signIn: {
    ...arSA.signIn,
    start: { ...arSA.signIn?.start, title: 'تسجيل الدخول إلى مَتِين', subtitle: 'تابع دراستك من حيث توقفت.' },
  },
  signUp: {
    ...arSA.signUp,
    start: { ...arSA.signUp?.start, title: 'أنشئ حسابك في مَتِين', subtitle: 'ابدأ الدراسة، أو احفظ ملفك كمعلم.' },
  },
};

const clerkAppearance = {
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'none' as const,
    socialButtonsPlacement: 'bottom' as const,
  },
  variables: {
    colorPrimary: '#994703',
    colorForeground: '#3a2a22',
    colorMutedForeground: '#6b5a50',
    colorDanger: '#a32d1b',
    colorBackground: '#fffdf8',
    colorInput: '#fdf9f3',
    colorInputForeground: '#3a2a22',
    colorNeutral: '#6D4C3D',
    fontFamily: 'Cairo, sans-serif',
    borderRadius: '0.9rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffdf8] rounded-3xl w-[440px] max-w-full overflow-hidden border border-[#e6dccf] shadow-[0_30px_60px_-40px_rgba(109,76,61,0.6)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'font-bold text-[#3a2a22]',
    headerSubtitle: 'text-[#6b5a50]',
    socialButtonsBlockButtonText: 'text-[#3a2a22] font-semibold',
    formFieldLabel: 'text-[#3a2a22] font-semibold',
    footerActionLink: 'text-[#994703] font-bold',
    footerActionText: 'text-[#6b5a50]',
    dividerText: 'text-[#6b5a50]',
    formButtonPrimary: 'bg-[#994703] hover:bg-[#7d3a02] text-white font-bold',
  },
};

function SignInPage() {
  usePageMeta('تسجيل الدخول | مَتِين', 'ادخل إلى حسابك في منصة مَتِين لمتابعة دراستك.');
  return (
    <AuthFrame>
      <div className="flex justify-center"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>
    </AuthFrame>
  );
}
function SignUpPage() {
  usePageMeta('إنشاء حساب | مَتِين', 'أنشئ حسابك في منصة مَتِين طالباً أو معلماً.');
  return (
    <AuthFrame>
      <div className="flex justify-center"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>
    </AuthFrame>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prev = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsub = addListener(({ user }) => {
      const id = user?.id ?? null;
      claimAssessmentStorage(id);
      if (prev.current !== undefined && prev.current !== id) qc.clear();
      prev.current = id;
    });
    return unsub;
  }, [addListener, qc]);
  return null;
}

function Portal({ role, children }: { role: 'student' | 'teacher'; children: React.ReactNode }) {
  return <PortalGate role={role}>{children}</PortalGate>;
}

function Routes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      localization={mateenLocale}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeGate} />
          <Route path="/about" component={AboutPage} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/onboarding" component={OnboardingPage} />
          <Route path="/student"><Portal role="student"><StudentHome /></Portal></Route>
          <Route path="/student/tracks"><Portal role="student"><TracksPage /></Portal></Route>
          <Route path="/student/learn/:textId"><Portal role="student"><LearningMapPage /></Portal></Route>
          <Route path="/student/learn/:textId/:stageNumber"><Portal role="student"><LearningStagePage /></Portal></Route>
          <Route path="/student/study"><Portal role="student"><StudyLibraryPage /></Portal></Route>
          <Route path="/student/study/reports"><Portal role="student"><StudyReportsPage /></Portal></Route>
          <Route path="/student/study/:textId"><Portal role="student"><StudyReaderPage /></Portal></Route>
          <Route path="/student/reviews"><Portal role="student"><ReviewsPage /></Portal></Route>
          <Route path="/student/scholars"><Portal role="student"><ScholarsPage /></Portal></Route>
          <Route path="/student/scholars/:teacherId"><Portal role="student"><ScholarProfilePage /></Portal></Route>
          <Route path="/student/messages"><Portal role="student"><MessagesPage /></Portal></Route>
          <Route path="/student/assistant"><Portal role="student"><AssistantPage /></Portal></Route>
          <Route path="/student/exams"><Portal role="student"><ExamsPage /></Portal></Route>
          <Route path="/student/exams/:attemptId"><Portal role="student"><ExamAttemptPage /></Portal></Route>
          <Route path="/admin/assessments" component={AdminAssessments} />
          <Route path="/student/settings"><Portal role="student"><SettingsPage /></Portal></Route>
          <Route path="/teacher"><Portal role="teacher"><TeacherHome /></Portal></Route>
          <Route path="/teacher/overview"><Portal role="teacher"><TeacherOverview /></Portal></Route>
          <Route path="/teacher/messages"><Portal role="teacher"><MessagesPage teacher /></Portal></Route>
          <Route path="/teacher/settings"><Portal role="teacher"><SettingsPage /></Portal></Route>
          <Route path="/admin" component={AdminHome} />
          <Route path="/admin/teachers" component={AdminTeachers} />
          <Route path="/admin/sources" component={AdminSources} />
          <Route path="/admin/audit" component={AdminAudit} />
          <Route path="/admin/scholarly" component={ScholarlyAdminPage} />
          <Route component={NotFound} />
        </Switch>
        <Toaster />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <Routes />
    </WouterRouter>
  );
}

export default App;
