import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Check, ChevronDown, ChevronLeft, Copy, Menu, Moon, 
  Play, Send, Share2, Sparkles, Sun, Volume2, VolumeX, X, 
  Mic, Info, BookOpen, PenTool, ScrollText, Mic2, FileText,
  UserCheck
} from 'lucide-react';
import { Link } from 'wouter';
import logoPath from '@assets/MateeeeeeeeenLOGO_1790090010886.png';

type Theme = 'parchment' | 'night';
type AuthState = { open: boolean; tab: 'student' | 'teacher'; mode: 'login' | 'register' };

const features = [
  ['التصحيح الصوتي اللحظي', 'دقة صوتية فائقة', 'نموذج تعرّف صوتي استثنائي خُصص للنطق العربي الفصيح وقواعد القراءة. يستمع لتسميع الطالب حرفاً فحرفاً، ويكتشف أخطاء الحركات والتشكيل والإعراب فور النطق بها دون تأخير.'],
  ['المساعد التفاعلي مَتِين', 'شروح موثقة', 'اسأل المساعد الذكي عن أي لفظ غريب، أو إعراب معضل، أو استفسار عقدي أو فقهي، وسيجيبك في ثوانٍ مستنداً إلى أمهات الشروح المعتمدة لكل متن، مع العزو الدقيق للجزء والصفحة.'],
  ['توجيه بشري موثوق', 'توجيه بشري', 'التقنية وسيلة إتقان وتمكين وليست بديلاً عن الشيخ المعلم؛ توفر المنصة ربطاً مباشراً بشبكة من المقرئين المتقنين والمشايخ المجازين للتوجيه والإجابة عن الأسئلة المعقدة التي يمتنع المساعد الذكي "متين" عن إجابتها.'],
  ['تلقين صوتيات المتقنين', 'استمع وكرر', 'مكتبة صوتية نقية تضم تلاوات وقراءات لأكابر القراء والمشايخ المحققين، تتيح لك خاصية التكرار الذكي (3x, 5x, 7x) والمضاهاة الصوتية لترسيخ اللفظ السليم في ذاكرتك.'],
  ['متابعة وتحليل المستوى', 'تكرار متباعد', 'لوحة تحليلات ذكية ترصد منحنى أدائك وتحدد الكلمات التي يتكرر فيها ترددك، وتجدول لك مراجعات دورية ذكية متباعدة لضمان عدم نسيان ما حفظته.'],
  ['تدرج في التعلم', 'تأصيل منهجي', 'خطة دراسية أصيلة تبدأ بصغار المتون قبل كبارها، من المستوى التمهيدي وحتى المنظومات المتقدمة والمطولات، تحصيناً للطالب من التشتت وسيراً على سنن العلماء في التلقي.'],
  ['اختبار تحديد المستوى', 'اختصر وقتك', 'لا تبدأ من الصفر إذا كنت حافظاً؛ خُض اختباراً تشخيصياً تفاعلياً يقيس بدقة مستواك ليوجهك مباشرة إلى المرحلة التي تناسب حصيلتك العلمية.']
];

const faqs = [
  ['هل يغني الذكاء الاصطناعي في المنصة عن التلقي من المشايخ؟', 'قطعاً لا؛ إنما هو مساعد ذكي ومرافق يضبط لك الأوقات التي لا تجد فيها شيخاً يسمع لك، ويصحح لك أخطاء التشكيل والحفظ الأولية، حتى إذا رسخ حفظك عُرضت قراءتك النهائية على الشيوخ المعتمدين للإجازة.'],
  ['كيف تضمن المنصة صحة إجابات المساعد "مَتِين" وعدم خطئه في الفتوى؟', 'تم بناء المساعد عبر تقنية الـ RAG الصارمة والمغلقة، بحيث لا يولد إجابات من خياله، بل يستخرج النصوص نصياً من الشروح المعتمدة فقط (مثل شرح ابن عثيمين، والنووي، وابن حجر) مع ذكر الكتاب والصفحة، ولا يفتي في النوازل المعاصرة بل يحيل إلى العلماء.'],
  ['هل المنصة مجانية أم تتطلب اشتراكاً؟', 'مسارات الحفظ الأساسية والمحاكي الصوتي اللحظي متاحة كوقف علمي مجاني لجميع طلاب العلم حول العالم، وهناك خدمات توجيه شخصي مكثف ودورات إجازة خاصة يدعم ريعها البنية السحابية للمشروع.'],
  ['كيف أبدأ الدراسة كطالب، وهل يلزم التسجيل الفوري؟', 'يمكنك البدء فوراً بالنقر على زر «اختبار تحديد المستوى» لتقييم حفظك في 3 دقائق، أو الضغط على «التسجيل كطالب» لإنشاء حساب وتتبع محفوظاتك عبر لوحة تحليلاتك الشخصية.']
];

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/60 px-4 py-2 font-ui text-[12px] font-bold text-foreground shadow-sm backdrop-blur-sm">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-75"></span>
        <span className="relative inline-flex h-2 w-2 rounded-full bg-secondary"></span>
      </span>
      {children}
    </span>
  );
}

function SectionTitle({ badge, title, text, centered = true }: { badge: string; title: string; text: string; centered?: boolean }) {
  return (
    <div className={`mb-20 max-w-2xl ${centered ? 'mx-auto text-center' : ''}`}>
      <Badge>{badge}</Badge>
      <h2 className="font-display text-[2.5rem] font-bold leading-tight text-foreground md:text-[3.25rem]">{title}</h2>
      <p className="font-arabic mt-6 text-[1.125rem] leading-loose text-muted-foreground">{text}</p>
    </div>
  );
}

export function MateenLanding() {
  const [theme, setTheme] = useState<Theme>('parchment');
  const [auth, setAuth] = useState<AuthState>({ open: false, tab: 'student', mode: 'login' });
  const [assistant, setAssistant] = useState(false);
  const [audio, setAudio] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => { 
    document.documentElement.classList.toggle('dark', theme === 'night'); 
    document.documentElement.dir = 'rtl'; 
  }, [theme]);

  const openAuth = (tab: 'student' | 'teacher', mode: 'login' | 'register' = 'register') => setAuth({ open: true, tab, mode });
  const notify = (m: string) => { setToast(m); window.setTimeout(() => setToast(''), 3000); };

  return (
    <div className="grain flex min-h-dvh flex-col overflow-hidden bg-background text-foreground transition-colors duration-500">
      <Navbar theme={theme} setTheme={setTheme} audio={audio} setAudio={setAudio} openAuth={openAuth} onAssistant={() => setAssistant(true)} />
      
      <main className="flex-1">
        <Hero openAuth={openAuth} />
        <Features openAuth={openAuth} />
        <Hadith notify={notify} />
        <Tracks />
        <Methodology />
        <FAQ />
        <CTA openAuth={openAuth} />
      </main>
      
      <Footer />

      <button 
        onClick={() => setAssistant(true)} 
        aria-label="اسأل مَتِين" 
        data-testid="button-open-assistant" 
        className="font-ui fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full border border-secondary/20 bg-card px-6 py-4 text-[14px] font-bold text-secondary shadow-2xl shadow-secondary/10 transition-all hover:-translate-y-1 hover:border-secondary/40 hover:bg-secondary/5"
      >
        <Sparkles size={18} className="text-secondary" />
        اسأل مَتِين
      </button>

      <AnimatePresence>
        {auth.open && <AuthModal state={auth} setState={setAuth} />} 
        {assistant && <Assistant close={() => setAssistant(false)} openAuth={() => { setAssistant(false); openAuth('student', 'login'); }} />}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: 20 }} 
            className="font-ui fixed bottom-6 left-6 z-50 flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-sm font-bold text-foreground shadow-2xl"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-white"><Check size={14} /></span>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Navbar({ theme, setTheme, audio, setAudio, openAuth, onAssistant }: { theme: Theme; setTheme: (x: Theme) => void; audio: boolean; setAudio: (x: boolean) => void; openAuth: (a: 'student' | 'teacher', b: 'login' | 'register') => void; onAssistant: () => void }) {
  const [menu, setMenu] = useState(false);
  const links = [
    ['عن المنصة', '/about'],
    ['المحاكي الذكي', '#smart-emulator'],
    ['مزايا المنصة', '#features'],
    ['المسارات الحالية', '#tracks'],
    ['منهجية العمل', '#methodology'],
    ['الأسئلة الشائعة', '#faq']
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl transition-colors">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2" data-testid="link-home">
          <img src={logoPath} alt="مَتِين" className="brand-logo h-11 w-auto object-contain" />
        </Link>
        
        <nav className="hidden items-center gap-8 lg:flex">
          {links.map(([label, href]) => (
            <Link key={href} href={href} data-testid={`link-nav-${label}`} className="font-ui text-[14px] font-bold text-muted-foreground transition hover:text-foreground">
              {label}
            </Link>
          ))}
        </nav>
        
        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-1 sm:flex rounded-full border border-border bg-card p-1 shadow-sm">
            <button 
              onClick={() => setAudio(!audio)} 
              aria-label={audio ? 'كتم الصوت' : 'تشغيل الصوت'} 
              data-testid="button-audio" 
              className={`rounded-full p-2 transition-colors ${audio ? 'bg-secondary/10 text-secondary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            >
              {audio ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button 
              onClick={() => setTheme(theme === 'night' ? 'parchment' : 'night')} 
              aria-label="تبديل المظهر" 
              data-testid="button-theme" 
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {theme === 'night' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          
          <button 
            onClick={() => openAuth('student', 'login')} 
            data-testid="button-login" 
            className="font-ui hidden rounded-full bg-primary px-7 py-2.5 text-[14px] font-bold text-primary-foreground shadow-lg shadow-primary/10 transition hover:-translate-y-0.5 hover:bg-primary/90 sm:block"
          >
            تسجيل الدخول
          </button>
          
          <button onClick={() => setMenu(!menu)} className="rounded-lg p-2 text-foreground transition-colors hover:bg-muted lg:hidden" aria-label="القائمة" data-testid="button-menu">
            {menu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      
      <AnimatePresence>
        {menu && (
          <motion.nav 
            initial={{ height: 0, opacity: 0 }} 
            animate={{ height: 'auto', opacity: 1 }} 
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border bg-background px-6 pb-6 pt-4 lg:hidden font-ui"
          >
            <div className="space-y-1">
              {links.map(([l, h]) => (
                <Link onClick={() => setMenu(false)} key={h} href={h} className="block rounded-xl px-4 py-4 text-[15px] font-bold text-foreground hover:bg-muted">
                  {l}
                </Link>
              ))}
            </div>
            <div className="mt-4 flex gap-3 border-t border-border pt-4">
               <button onClick={() => { setMenu(false); setTheme(theme === 'night' ? 'parchment' : 'night'); }} className="flex-1 rounded-xl border border-border bg-card py-3.5 flex justify-center items-center gap-2 font-bold text-sm text-foreground">
                 {theme === 'night' ? <><Sun size={16}/> المظهر النهاري</> : <><Moon size={16}/> المظهر الليلي</>}
               </button>
               <button onClick={() => { setMenu(false); setAudio(!audio); }} className="flex-1 rounded-xl border border-border bg-card py-3.5 flex justify-center items-center gap-2 font-bold text-sm text-foreground">
                 {audio ? <><Volume2 size={16}/> إيقاف التلاوة</> : <><VolumeX size={16}/> تشغيل التلاوة</>}
               </button>
            </div>
            <button onClick={() => { setMenu(false); openAuth('student', 'login'); }} className="mt-4 w-full rounded-xl bg-primary py-4 text-[15px] font-bold text-primary-foreground shadow-lg shadow-primary/10">
              تسجيل الدخول
            </button>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

function Hero({ openAuth }: { openAuth: (a: 'student' | 'teacher', b: 'login' | 'register') => void }) {
  return (
    <section className="relative overflow-hidden bg-background pt-20 pb-28 md:pt-28 md:pb-40">
      <div className="absolute inset-0 manuscript-pattern" />
      <div className="absolute top-0 right-0 h-[40rem] w-[40rem] -translate-y-1/2 translate-x-1/3 rounded-full bg-secondary/10 blur-[100px] pointer-events-none" />
      
      <div className="relative z-10 mx-auto grid max-w-[1400px] items-center gap-16 px-6 lg:grid-cols-[1.1fr_0.9fr]">
        
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <Badge>المنصة الذكية الأولى المتخصصة في متون ومنظومات علوم الشريعة</Badge>
          
          <h1 className="font-display mt-6 text-[3rem] font-bold leading-[1.1] text-foreground md:text-[4.5rem]">
            مساعدك الذكي
            <br />
            <span className="text-secondary drop-shadow-sm">للحفظ المتين</span>
          </h1>
          
          <p className="font-arabic mt-8 max-w-2xl text-[1.125rem] leading-[2.2] text-muted-foreground md:text-[1.25rem]">
            نجمع بين جلال المتون العلمية ورسوخ شروحها الأثرية، وأحدث خوارزميات الاستماع الصوتي والذكاء الاصطناعي التوليدي. صحّح قراءتك وتشكيلك لحظياً، وتلقّ الدعم والتوجيه من المشائخ المتقنين بالمنصة.
          </p>
          
          <div className="font-ui mt-10 flex flex-wrap items-center gap-4">
            <button 
              onClick={() => openAuth('student', 'register')} 
              data-testid="button-student-register" 
              className="flex items-center gap-3 rounded-2xl bg-secondary px-8 py-4.5 text-[15px] font-bold text-white shadow-xl shadow-secondary/20 transition-all hover:-translate-y-1 hover:bg-secondary/90 hover:shadow-secondary/30"
            >
              التسجيل كطالب
              <ArrowLeft size={18} />
            </button>
            <button 
              onClick={() => openAuth('teacher', 'register')} 
              data-testid="button-teacher-register" 
              className="flex items-center gap-2 rounded-2xl border-2 border-border bg-card px-8 py-4.5 text-[15px] font-bold text-foreground transition-all hover:-translate-y-1 hover:border-primary/30 hover:bg-muted"
            >
              التسجيل كمعلم وموجه
            </button>
          </div>
          
          <div className="font-ui mt-12 flex flex-wrap items-center gap-x-8 gap-y-4 text-[13px] font-bold text-muted-foreground">
            <span className="flex items-center gap-2"><Check size={16} className="text-secondary"/> شروح محققة</span>
            <span className="flex items-center gap-2"><Check size={16} className="text-secondary"/> تصحيح لحظي</span>
            <span className="flex items-center gap-2"><Check size={16} className="text-secondary"/> توجيه ودعم بشري عند الحاجة</span>
          </div>
        </motion.div>
        
        <Simulator />
      </div>
    </section>
  );
}

function Simulator() {
  const [track, setTrack] = useState('الأصول الثلاثة');
  const [playing, setPlaying] = useState(false);
  const [mic, setMic] = useState(false);
  const [speed, setSpeed] = useState('١.٠×');
  
  return (
    <motion.div 
      id="smart-emulator" 
      initial={{ opacity: 0, scale: 0.96 }} 
      animate={{ opacity: 1, scale: 1 }} 
      transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="relative mx-auto w-full max-w-[32rem] lg:mr-auto"
    >
      <div className="absolute -inset-1 rounded-[2.5rem] bg-gradient-to-tr from-secondary/20 to-primary/10 blur-xl" />
      
      <div className="relative rounded-[2rem] border border-border/80 bg-card p-2 shadow-2xl shadow-primary/10">
        <div className="rounded-[1.75rem] border border-border/50 bg-background/50 p-6 backdrop-blur-xl sm:p-8">
          
          <div className="mb-8 flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
                <Mic2 size={24} strokeWidth={2.5} />
              </div>
              <div>
                <h3 className="font-display text-[1.125rem] font-bold text-foreground">تحليل التسميع المباشر</h3>
                <span className="font-ui mt-1.5 flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-secondary"></span> جاهز للتسميع
                </span>
              </div>
            </div>
          </div>
          
          <div className="font-ui mb-8 flex overflow-hidden rounded-xl border border-border bg-muted/30 p-1">
            <button 
              onClick={() => setTrack('الأصول الثلاثة')} 
              className={`flex-1 rounded-lg py-2.5 text-[12px] font-bold transition-all ${track === 'الأصول الثلاثة' ? 'bg-card text-primary shadow-sm border border-border/50' : 'text-muted-foreground hover:text-foreground'}`}
            >
              الأصول الثلاثة
            </button>
            <button 
              onClick={() => setTrack('تحفة الأطفال')} 
              className={`flex-1 rounded-lg py-2.5 text-[12px] font-bold transition-all ${track === 'تحفة الأطفال' ? 'bg-card text-primary shadow-sm border border-border/50' : 'text-muted-foreground hover:text-foreground'}`}
            >
              تحفة الأطفال
            </button>
          </div>
          
          <div className="mb-8 min-h-[160px]">
            <p className="font-arabic text-xs font-semibold text-muted-foreground mb-4 opacity-70">من متن {track}</p>
            <p className="font-arabic text-right text-[1.5rem] leading-[2.2] text-foreground sm:text-[1.75rem]">
              فَإِذَا قِيلَ لَكَ: مَنْ رَبُّكَ؟ فَقُلْ: رَبِّيَ اللَّهُ الَّذِي <span className="relative inline-block whitespace-nowrap rounded-md bg-secondary/10 px-1 text-secondary">رَبَّانِي<span className="absolute -bottom-1 left-0 right-0 h-[3px] rounded-full bg-secondary/40"></span></span> وَرَبَّى جَمِيعَ الْعَالَمِينَ بِنِعَمِهِ، وَهُوَ مَعْبُودِي لَيْسَ لِي مَعْبُودٌ سِوَاهُ.
            </p>
          </div>
          
          <div className="relative mb-8 overflow-hidden rounded-2xl border border-border bg-card p-5">
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-secondary" />
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 font-ui text-[12px] font-bold text-secondary">
                <Info size={14} />
                <span>المساعد مَتِين</span>
              </div>
              <span className="font-ui rounded bg-secondary/10 px-2 py-0.5 text-[10px] font-bold text-secondary">توجيه فوري</span>
            </div>
            <p className="font-arabic text-[13px] leading-relaxed text-muted-foreground">
              تنبيه صوتي دقيق: لاحظنا تخفيف حرف الباء؛ والصواب تشديدها مع الفتح «رَبَّانِي». والتربية هاهنا هي تربية النعمة والتغذية بها ظاهراً وباطناً كما قرره العلامة ابن عثيمين في شرحه.
            </p>
          </div>

          <div className="font-ui flex items-center gap-3 sm:gap-4">
            <button 
              onClick={() => setPlaying(!playing)} 
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-[13px] font-bold text-primary-foreground shadow-xl shadow-primary/20 transition-all hover:-translate-y-0.5 hover:bg-primary/90"
            >
              {playing ? <span className="text-lg leading-none">||</span> : <Play size={16} fill="currentColor" />}
              استمع للتسميع
            </button>
            <button 
              onClick={() => setMic(!mic)} 
              className={`flex h-14 flex-1 items-center justify-center gap-2 rounded-xl border-2 text-[13px] font-bold transition-all ${mic ? 'border-secondary bg-secondary/10 text-secondary' : 'border-border bg-card text-foreground hover:bg-muted'}`}
            >
              <Mic size={16} />
              ميكروفون
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Features({ openAuth }: { openAuth: (a: 'student' | 'teacher', b: 'login' | 'register') => void }) {
  const getGridClass = (i: number) => {
    switch (i) {
      case 0: return 'lg:col-span-2 lg:row-span-2';
      case 1: return 'lg:col-span-1';
      case 2: return 'lg:col-span-1';
      case 3: return 'lg:col-span-2';
      case 4: return 'lg:col-span-1';
      case 5: return 'lg:col-span-1';
      case 6: return 'lg:col-span-2';
      default: return 'col-span-1';
    }
  };

  return (
    <section id="features" className="border-t border-border/40 bg-card py-24 md:py-32">
      <div className="mx-auto max-w-[1400px] px-6">
        <SectionTitle 
          badge="نظام التعلم المتكامل" 
          title="دليلك الشامل نحو الإتقان والرسوخ" 
          text="سبع ركائز بنيت عليها منصة متين لتجمع بين أصالة الحلقات القرآنية والتراثية، وأحدث ما توصلت إليه تقنيات الذكاء الاصطناعي التوليدي." 
        />
        
        <div className="mx-auto mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <article 
              key={f[0]} 
              className={`group relative overflow-hidden rounded-[2rem] border border-border bg-background p-8 transition-all hover:border-secondary/40 hover:shadow-2xl hover:shadow-secondary/5 sm:p-10 ${getGridClass(i)}`}
            >
              <div className="absolute -left-6 -top-6 z-0 select-none text-[8rem] font-bold leading-none text-muted/30 transition-colors group-hover:text-secondary/5 font-display pointer-events-none">
                {String(i + 1).padStart(2, '0')}
              </div>
              
              <div className="relative z-10 flex h-full flex-col">
                <div>
                  <span className="font-ui mb-6 inline-flex items-center rounded-full border border-primary/10 bg-primary/5 px-3 py-1 text-[11px] font-bold text-primary">
                    {f[1]}
                  </span>
                  <h3 className="font-display mb-4 text-[1.5rem] font-bold text-foreground transition-colors group-hover:text-secondary">{f[0]}</h3>
                  <p className="font-arabic text-[15px] leading-8 text-muted-foreground">{f[2]}</p>
                </div>
                
                {i === 6 && (
                  <div className="mt-8 pt-4">
                    <button 
                      onClick={() => openAuth('student', 'register')} 
                      className="font-ui flex items-center gap-2 text-[14px] font-bold text-secondary transition-all group-hover:gap-3" 
                      data-testid="button-diagnostic-test"
                    >
                      ابدأ الاختبار التشخيصي الآن
                      <ArrowLeft size={16} />
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Hadith({ notify }: { notify: (x: string) => void }) {
  const text = '«مَنْ سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا؛ سَهَّلَ اللَّهُ لَهُ بِهِ طَرِيقًا إِلَى الْجَنَّةِ»';
  const source = 'صحيح مسلم';
  
  const handleCopy = async () => {
    await navigator.clipboard?.writeText(`${text}\n${source}`);
    notify('نُسخ الحديث ومصدره');
  };
  
  const handleShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ text: `${text}\n${source}` }); } catch (err) {}
    } else {
      await handleCopy();
    }
  };
  
  return (
    <section className="relative overflow-hidden bg-primary py-32 text-center text-primary-foreground border-y border-border">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12),transparent_68%)] opacity-70" />
      <div className="absolute -left-40 -top-40 h-[40rem] w-[40rem] rounded-full bg-secondary/30 blur-[120px]" />
      <div className="absolute -bottom-40 -right-40 h-[40rem] w-[40rem] rounded-full bg-accent/30 blur-[120px]" />
      
      <div className="relative z-10 mx-auto max-w-4xl px-6">
        <span className="font-ui mb-10 inline-block rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-5 py-2 text-[12px] font-bold text-primary-foreground backdrop-blur-sm shadow-sm">
          قال رسول الله ﷺ
        </span>
        
        <blockquote className="font-arabic mb-8 text-[2.25rem] font-bold leading-[1.6] text-primary-foreground drop-shadow-md md:text-[3.25rem]">
          {text}
        </blockquote>
        
        <p className="font-ui mb-14 text-xl font-bold text-primary-foreground/80">
          {source}
        </p>
        
        <div className="font-ui flex justify-center gap-4">
          <button 
            onClick={handleCopy} 
            className="flex items-center gap-2 rounded-2xl bg-primary-foreground/10 border border-primary-foreground/20 px-6 py-3.5 text-[14px] font-bold text-primary-foreground backdrop-blur-sm transition hover:bg-primary-foreground/20" 
            data-testid="button-copy-hadith"
          >
            <Copy size={16} />
            نسخ الحديث
          </button>
          <button 
            onClick={handleShare} 
            className="flex items-center gap-2 rounded-2xl bg-primary-foreground/10 border border-primary-foreground/20 px-6 py-3.5 text-[14px] font-bold text-primary-foreground backdrop-blur-sm transition hover:bg-primary-foreground/20" 
            data-testid="button-share-hadith"
          >
            <Share2 size={16} />
            مشاركة
          </button>
        </div>
      </div>
    </section>
  );
}

function Tracks() {
  const tracks = [
    {
      title: 'مسار الحديث',
      badge: 'أصول الرواية وقواعد الأثر',
      desc: 'استكشاف واستظهار أمهات المتون الحديثية لتأسيس طالب العلم في السنة النبوية الشريفة ومعرفة جوامع الكلم.',
      hover: 'الأربعون النووية',
      icon: ScrollText
    },
    {
      title: 'مسار العقيدة',
      badge: 'رسوخ التوحيد والأدلة',
      desc: 'دراسة متدرجة لأهم المتون العقائدية المحررة لتأصيل طالب العلم في أبواب التوحيد والإيمان ومسائل الاعتقاد على منهج السلف الصالح.',
      hover: 'نواقض الإسلام، القواعد الأربعة',
      icon: BookOpen
    },
    {
      title: 'مسار التجويد والقراءات',
      badge: 'إتقان التلاوة وضبط الحروف',
      desc: 'مسار متخصص لضبط أحكام التلاوة ومخارج الحروف، ودراسة المنظومات العلمية الضابطة للأداء الصوتي السليم.',
      hover: 'تحفة الأطفال',
      icon: PenTool
    }
  ];
  
  return (
    <section id="tracks" className="bg-background py-24 md:py-32">
      <div className="mx-auto max-w-[1400px] px-6">
        <SectionTitle 
          badge="المناهج العلمية المعتمدة" 
          title="المسارات الأكاديمية النشطة" 
          text="اختر مسارك العلمي لتبدأ رحلة الحفظ المنهجي والتلقين الصوتي اللحظي عبر متون محققة على أيدي علماء الأمة." 
        />
        
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {tracks.map((t) => (
            <article 
              key={t.title} 
              className="group relative flex min-h-[380px] flex-col justify-between overflow-hidden rounded-[2.5rem] border border-border bg-card p-10 transition-all hover:-translate-y-2 hover:border-secondary/30 hover:shadow-2xl hover:shadow-secondary/10"
            >
              <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-gradient-to-bl from-secondary/5 to-transparent transition-opacity group-hover:opacity-100 opacity-50" />
              
              <div className="relative z-10">
                <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/10 text-secondary transition-all group-hover:scale-110 group-hover:bg-secondary group-hover:text-white">
                  <t.icon size={28} strokeWidth={1.5} />
                </div>
                
                <span className="font-ui mb-4 block text-[11px] font-bold text-secondary">{t.badge}</span>
                <h3 className="font-display mb-4 text-[1.75rem] font-bold text-foreground">{t.title}</h3>
                <p className="font-arabic text-[15px] leading-8 text-muted-foreground">{t.desc}</p>
              </div>
              
              <div className="relative z-10 mt-8 border-t border-border/60 pt-6">
                <span className="font-ui flex items-center gap-2 text-[13px] font-bold text-primary transition-colors group-hover:text-secondary">
                  عرض تفاصيل المنهج
                  <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
                </span>
                <p className="font-ui absolute bottom-6 left-8 text-[11px] font-bold text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">{t.hover}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Methodology() {
  const items = [
    { num: '01', title: 'محرك النطق الصوتي', desc: 'نموذج تعلم عميق مخصص للصوتيات العربية ومخارج الحروف وقواعد النطق، يحلل تسميع الطالب للمتون والمنظومات العلمية وحروفها بدقة عالية، ويطابق النطق مع التشكيل والضبط المعتمد للألفيات والمتون لضمان السلامة اللغوية والأداء المتقن.' },
    { num: '02', title: 'محرك RAG للشروحات المحققة', desc: 'قاعدة بيانات شعاعية (Vector Database) تفهرس آلاف الصفحات من أمهات شروح المتون، وتسترجع النص الحرفي الدقيق بدلاً من التوليد العشوائي، لتجنب الوهم والخطأ.' },
    { num: '03', title: 'التدخل البشري عند الحاجة', desc: 'لوحة مخصصة للمشايخ المتقنين تتيح لهم الإجابة عن الأسئلة عند إحالة الطالب إليهم من قبل المساعد الذكي، والرد على الاستفسارات المباشرة، وتوجيه وإرشاد طلاب المنصة.' }
  ];
  
  return (
    <section id="methodology" className="border-y border-border/40 bg-card py-24 md:py-32">
      <div className="mx-auto max-w-[1400px] px-6">
        <SectionTitle 
          badge="الهندسة البرمجية والأصالة التراثية" 
          title="كيف تعمل منصة مَتِين؟" 
          text="معمارية متكاملة ثلاثية الأركان تضم دقة الفتوى وصحة التلاوة وحفظ المتون دون أي خلل." 
        />
        
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {items.map((x) => (
            <div key={x.num} className="group relative overflow-hidden rounded-[2rem] border border-border bg-background p-10 transition-all hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5">
              <span className="font-display absolute -right-4 -top-8 text-[6rem] font-bold leading-none text-muted/40 transition-colors group-hover:text-primary/5 pointer-events-none select-none">
                {x.num}
              </span>
              <div className="relative z-10">
                <span className="font-display flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-[1.25rem] font-bold text-primary-foreground shadow-lg shadow-primary/20 mb-8">
                  {x.num}
                </span>
                <h3 className="font-display mb-4 text-[1.5rem] font-bold text-foreground">{x.title}</h3>
                <p className="font-arabic text-[15px] leading-8 text-muted-foreground">{x.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const [active, setActive] = useState<number | null>(0);
  
  return (
    <section id="faq" className="bg-background py-24 md:py-32">
      <div className="mx-auto max-w-3xl px-6">
        <SectionTitle 
          badge="إجابات شافية" 
          title="الأسئلة الشائعة" 
          text="كل ما تود معرفته عن آلية الحفظ، ودقة الذكاء الاصطناعي، والإشراف الشرعي." 
        />
        
        <div className="mt-12 space-y-4">
          {faqs.map((f, i) => (
            <div 
              key={f[0]} 
              className={`overflow-hidden rounded-[1.5rem] border transition-all duration-300 ${active === i ? 'border-secondary/40 bg-card shadow-lg shadow-secondary/5' : 'border-border bg-card/50 hover:border-primary/30 hover:bg-card'}`}
            >
              <button 
                onClick={() => setActive(active === i ? null : i)} 
                aria-expanded={active === i} 
                className="flex w-full items-center justify-between gap-4 p-6 text-right font-display text-[1.125rem] font-bold text-foreground" 
                data-testid={`button-faq-${i}`}
              >
                {f[0]}
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${active === i ? 'bg-secondary text-white' : 'bg-muted text-muted-foreground'}`}>
                  <ChevronDown size={20} className={`transition-transform duration-300 ${active === i ? 'rotate-180' : ''}`} />
                </span>
              </button>
              <AnimatePresence>
                {active === i && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }} 
                    animate={{ height: 'auto', opacity: 1 }} 
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                  >
                    <div className="font-arabic px-6 pb-8 pt-2 text-[15px] leading-8 text-muted-foreground">
                      <div className="border-t border-border/60 pt-6">
                        {f[1]}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA({ openAuth }: { openAuth: (a: 'student' | 'teacher', b: 'login' | 'register') => void }) {
  return (
    <section className="px-6 py-20">
      <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-[3rem] bg-secondary text-white shadow-2xl shadow-secondary/20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,white_1.5px,transparent_1.5px)] bg-[size:24px_24px] opacity-10" />
        
        <div className="relative z-10 px-8 py-24 text-center md:px-24 md:py-32">
          <div className="mx-auto max-w-4xl">
            <h2 className="font-display text-[2.5rem] font-bold leading-[1.2] md:text-[3.5rem]">
              ابدأ رحلتك المباركة في حفظ متون ومنظومات علوم الشريعة اليوم
            </h2>
            <p className="font-arabic mx-auto mt-8 max-w-2xl text-[1.125rem] leading-8 text-white/90">
              كن من أوائل المنضمين لضبط محفوظاتك وتأسيس علمك المنهجي عبر أحدث تقنيات الذكاء الاصطناعي الموجهة لخدمة العلوم الشرعية.
            </p>
            <button 
              onClick={() => openAuth('student', 'register')} 
              className="font-ui mt-12 inline-flex items-center gap-3 rounded-full bg-background px-10 py-5 text-[16px] font-bold text-foreground shadow-2xl transition-transform hover:-translate-y-1 hover:shadow-background/20" 
              data-testid="button-final-register"
            >
              سجل كطالب مجاناً
              <ArrowLeft size={20} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60 bg-card py-16 md:py-24">
      <div className="mx-auto grid max-w-[1400px] gap-12 px-6 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        
        <div className="lg:pr-12">
          <img src={logoPath} alt="مَتِين" className="brand-logo h-14 w-auto object-contain object-right" />
          <p className="font-arabic mt-8 max-w-md text-[15px] leading-8 text-muted-foreground">
            مَتِين؛ أول منصة تعليمية تفاعلية تدمج بين أصالة المتون العلمية وتقنيات الذكاء الاصطناعي الحديثة لخدمة طالب العلم وتأصيله وضبط قراءته ومحفوظاته بإشراف مشايخ موثوقين.
          </p>
        </div>
        
        <div>
          <h3 className="font-display text-[1.125rem] font-bold text-foreground">مسارات العلم</h3>
          <div className="font-ui mt-6 flex flex-col space-y-4 text-[14px] font-semibold text-muted-foreground">
            <a href="#tracks" className="transition hover:text-primary">مسار العقيدة</a>
            <a href="#tracks" className="transition hover:text-primary">مسار التجويد والقراءات</a>
            <a href="#tracks" className="transition hover:text-primary">مسار الحديث</a>
          </div>
        </div>
        
        <div>
          <h3 className="font-display text-[1.125rem] font-bold text-foreground">في المنصة</h3>
          <div className="font-ui mt-6 flex flex-col space-y-4 text-[14px] font-semibold text-muted-foreground">
            <a href="#smart-emulator" className="transition hover:text-primary">المحاكي الصوتي التفاعلي</a>
            <a href="#methodology" className="transition hover:text-primary">منهجية العمل</a>
            <a href="#faq" className="transition hover:text-primary">الأسئلة الشائعة</a>
          </div>
        </div>
        
        <div>
          <h3 className="font-display text-[1.125rem] font-bold text-foreground">الروابط السريعة</h3>
          <div className="font-ui mt-6 flex flex-col space-y-4 text-[14px] font-semibold text-muted-foreground">
            <Link href="/about" className="transition hover:text-primary">عن المنصة</Link>
            <button onClick={() => window.scrollTo(0, 0)} className="text-right transition hover:text-primary">العودة للأعلى</button>
          </div>
        </div>
        
      </div>
      
      <div className="mx-auto mt-16 max-w-[1400px] border-t border-border/60 px-6 pt-8 text-center md:flex md:items-center md:justify-between md:text-right">
        <p className="font-ui text-[13px] font-bold text-muted-foreground">
          © 2026 منصة متين (Mateen) التعليمية. جميع الحقوق محفوظة لخدمة علوم الشريعة.
        </p>
        <div className="font-ui mt-4 flex justify-center gap-4 text-[13px] font-bold text-muted-foreground/70 md:mt-0">
          <span>خالية تماماً من ذوات الأرواح</span>
          <span>•</span>
          <span>معايير إمكانية الوصول WCAG 2.2 AA</span>
        </div>
      </div>
    </footer>
  );
}

function AuthModal({ state, setState }: { state: AuthState; setState: (x: AuthState) => void }) {
  const [sent, setSent] = useState(false);
  
  return (
    <motion.div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-md" 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
    >
      <motion.div 
        role="dialog" 
        aria-modal="true" 
        initial={{ scale: 0.95, opacity: 0, y: 20 }} 
        animate={{ scale: 1, opacity: 1, y: 0 }} 
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="w-full max-w-[480px] overflow-hidden rounded-[2.5rem] border border-border bg-background shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border/50 bg-card/50 px-8 py-6">
          <div>
            <p className="font-ui mb-1 text-[11px] font-bold text-secondary">منصة مَتِين</p>
            <h2 className="font-display text-[1.5rem] font-bold text-foreground">{state.mode === 'login' ? 'مرحباً بعودتك' : 'ابدأ رحلتك العلمية'}</h2>
          </div>
          <button 
            onClick={() => setState({ ...state, open: false })} 
            aria-label="إغلاق" 
            data-testid="button-close-auth"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground transition hover:bg-muted/80 hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>
        
        <div className="p-8">
          <div className="font-ui flex rounded-xl border border-border/60 bg-card p-1.5 shadow-sm">
            <button 
              onClick={() => setState({ ...state, tab: 'student' })} 
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-[13px] font-bold transition-all ${state.tab === 'student' ? 'bg-background text-primary shadow-sm border border-border/40' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <UserCheck size={16} />
              حساب طالب علم
            </button>
            <button 
              onClick={() => setState({ ...state, tab: 'teacher' })} 
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-[13px] font-bold transition-all ${state.tab === 'teacher' ? 'bg-background text-primary shadow-sm border border-border/40' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <PenTool size={16} />
              طلب انضمام معلم/موجه
            </button>
          </div>
          
          <div className="font-ui mt-8 flex justify-center gap-8 text-[14px]">
            <button 
              onClick={() => setState({ ...state, mode: 'login' })} 
              className={`border-b-2 pb-2 transition-all ${state.mode === 'login' ? 'border-primary font-bold text-primary' : 'border-transparent font-semibold text-muted-foreground hover:text-foreground'}`}
            >
              تسجيل الدخول
            </button>
            <button 
              onClick={() => setState({ ...state, mode: 'register' })} 
              className={`border-b-2 pb-2 transition-all ${state.mode === 'register' ? 'border-primary font-bold text-primary' : 'border-transparent font-semibold text-muted-foreground hover:text-foreground'}`}
            >
              إنشاء حساب
            </button>
          </div>
          
          {sent ? (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mt-8 rounded-3xl border border-secondary/20 bg-secondary/5 p-10 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-secondary/10 text-secondary">
                <Check size={32} />
              </div>
              <p className="font-display text-[1.5rem] font-bold text-foreground">تم استلام طلبك</p>
              <p className="font-arabic mt-4 text-[15px] leading-relaxed text-muted-foreground">هذه تجربة محلية للواجهة، وستكون جاهزاً للبدء قريباً.</p>
            </motion.div>
          ) : (
            <motion.form 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }}
              onSubmit={e => { e.preventDefault(); setSent(true); }} 
              className="font-ui mt-8 space-y-5"
            >
              <div>
                <label className="mb-2 block text-[13px] font-bold text-foreground">البريد الإلكتروني</label>
                <input 
                  required 
                  type="email" 
                  data-testid="input-auth-email" 
                  className="w-full rounded-2xl border border-border bg-background px-5 py-4 text-[15px] outline-none transition focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50" 
                  placeholder="name@example.com"
                />
              </div>
              <div>
                <label className="mb-2 block text-[13px] font-bold text-foreground">كلمة المرور</label>
                <input 
                  required 
                  type="password" 
                  data-testid="input-auth-password" 
                  className="w-full rounded-2xl border border-border bg-background px-5 py-4 text-[15px] outline-none transition focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50" 
                  placeholder="••••••••"
                />
              </div>
              <button 
                className="mt-4 w-full rounded-2xl bg-primary py-4 text-[15px] font-bold text-primary-foreground shadow-lg shadow-primary/20 transition hover:-translate-y-0.5 hover:bg-primary/90" 
                data-testid="button-submit-auth"
              >
                {state.mode === 'login' ? 'دخول إلى حسابي' : 'إنشاء حسابي'}
              </button>
            </motion.form>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Assistant({ close, openAuth }: { close: () => void; openAuth: () => void }) {
  const answers = [
    'منصة «مَتِين» هي أول منصة تعليمية تفاعلية تدمج بين أصالة المتون والمنظومات العلمية وتقنيات الذكاء الاصطناعي الحديثة ومحركات النطق الصوتي؛ لتوفير بيئة متكاملة لطلاب العلم لضبط وتكرار ومراجعة حفظهم للمتون الشرعية بإشراف وتوجيه مشايخ موثوقين.',
    'تستهدف المنصة جميع طلاب وطالبات العلم الشرعي في مختلف المستويات؛ بدءاً من المبتدئين الراغبين في ضبط صغار المتون وتأسيس حصيلتهم العلمية، وحتى المتقدمين والمستظهرين للمنظومات الذين يبحثون عن أداة ذكية للمراجعة، والتسميع اللحظي، والربط بالشروحات المحققة.',
    'نحرص في «مَتِين» على أعلى معايير الوثوقية والضبط العلمي؛ حيث يُشترط لانضمام المشايخ والمعلمين الحصول على إجازات علمية معتمدة، وتخضع جميع الإجازات لعملية تدقيق وتحقق صارمة من قِبل إدارة المنصة قبل القبول. كما تتيح المنصة للطالب الاطلاع المباشر على الملف الشخصي (البروفايل) للشيخ، ومعرفة شيوخه وأسانيده ومعاينة إجازاته بكل شفافية.'
  ];
  const qs = [
    'ما هي منصة مَتِين؟',
    'لمن منصة مَتِين؟',
    'كيف يتم اختيار المشايخ في المنصة؟'
  ];
  
  const [answer, setAnswer] = useState('');
  const [input, setInput] = useState('');
  
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/20 backdrop-blur-sm">
      <motion.aside 
        initial={{ x: '100%' }} 
        animate={{ x: 0 }} 
        exit={{ x: '100%' }} 
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="flex h-full w-full max-w-[420px] flex-col border-l border-border bg-background shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border/50 bg-card/50 px-8 py-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
              <Sparkles size={20} />
            </div>
            <div>
              <p className="font-ui mb-1 text-[11px] font-bold text-muted-foreground">المساعد التعريفي</p>
              <h2 className="font-display text-[1.25rem] font-bold text-foreground">اسأل مَتِين</h2>
            </div>
          </div>
          <button 
            onClick={close} 
            aria-label="إغلاق المساعد" 
            data-testid="button-close-assistant"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground transition hover:bg-muted/80 hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>
        
        <div className="font-ui flex-1 overflow-auto p-8">
          <div className="mb-8 space-y-3">
            {qs.map((q, i) => (
              <button 
                key={q} 
                onClick={() => setAnswer(answers[i])} 
                className="flex w-full items-center justify-between rounded-2xl border border-border/80 bg-card p-4 text-right text-[13px] font-bold text-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary" 
                data-testid={`button-assistant-question-${i}`}
              >
                {q}
                <ChevronLeft size={16} className="shrink-0 text-muted-foreground/50" />
              </button>
            ))}
          </div>
          
          <div className="relative min-h-[220px] rounded-3xl border border-secondary/20 bg-secondary/5 p-6">
            <AnimatePresence mode="wait">
              {answer ? (
                <motion.div 
                  key="answer"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div className="mb-4 flex items-center gap-2 text-secondary">
                    <Sparkles size={16} />
                    <span className="text-[12px] font-bold">إجابة مَتِين</span>
                  </div>
                  <p className="font-arabic text-[15px] leading-8 text-foreground/90">{answer}</p>
                  
                  {answer.startsWith('للحصول') && (
                    <button 
                      onClick={openAuth} 
                      className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-md transition hover:-translate-y-0.5 hover:bg-primary/90" 
                      data-testid="button-assistant-login"
                    >
                      تسجيل الدخول
                      <ArrowLeft size={16} />
                    </button>
                  )}
                </motion.div>
              ) : (
                <motion.div 
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center text-center text-muted-foreground"
                >
                  <FileText size={32} strokeWidth={1} className="mb-4 text-muted-foreground/30" />
                  <p className="font-ui text-[13px] font-bold">اختر سؤالاً لتتعرف على مَتِين</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        
        <div className="border-t border-border/50 bg-card/80 p-6 backdrop-blur-md">
          <form 
            onSubmit={e => { 
              e.preventDefault(); 
              if (input.trim()) setAnswer('للحصول على إجابات مخصصة والاستفادة الكاملة من قدرات المساعد الذكي وتسميع المتون، يرجى تسجيل الدخول إلى حسابك.'); 
              setInput(''); 
            }} 
            className="font-ui relative"
          >
            <input 
              value={input} 
              onChange={e => setInput(e.target.value)} 
              className="w-full rounded-2xl border border-border bg-background py-4 pl-14 pr-5 text-[14px] shadow-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary" 
              placeholder="اكتب سؤالك هنا..." 
              data-testid="input-assistant"
            />
            <button 
              aria-label="إرسال السؤال" 
              className={`absolute left-2 top-2 flex h-10 w-10 items-center justify-center rounded-xl transition-all ${input.trim() ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground/50'}`}
              data-testid="button-send-assistant"
            >
              <Send size={16} className={input.trim() ? '-ml-0.5' : ''} />
            </button>
          </form>
        </div>
      </motion.aside>
    </div>
  );
}
