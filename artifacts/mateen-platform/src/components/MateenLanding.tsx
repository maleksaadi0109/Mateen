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
    <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-bold text-primary font-ui">
      <span className="h-1.5 w-1.5 rounded-full bg-secondary"></span>
      {children}
    </span>
  );
}

function SectionTitle({ badge, title, text, centered = true }: { badge: string; title: string; text: string; centered?: boolean }) {
  return (
    <div className={`mb-16 max-w-2xl ${centered ? 'mx-auto text-center' : ''}`}>
      <Badge>{badge}</Badge>
      <h2 className="font-display text-4xl font-bold leading-tight md:text-5xl text-foreground">{title}</h2>
      <p className="font-arabic mt-5 text-lg leading-8 text-muted-foreground">{text}</p>
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
    <div className="grain min-h-dvh overflow-hidden bg-background text-foreground transition-colors duration-500">
      <Navbar theme={theme} setTheme={setTheme} audio={audio} setAudio={setAudio} openAuth={openAuth} onAssistant={() => setAssistant(true)} />
      
      <main>
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
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-primary/20 bg-card px-5 py-3.5 text-sm font-bold text-primary shadow-2xl shadow-primary/10 transition hover:-translate-y-1 hover:border-primary/40 font-ui"
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
            className="fixed bottom-6 left-6 z-50 flex items-center gap-3 rounded-xl border border-primary/10 bg-card px-5 py-4 text-sm font-bold text-foreground shadow-2xl font-ui"
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
    <header className="sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur-xl transition-colors">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2" data-testid="link-home">
          <img src={logoPath} alt="مَتِين" className="brand-logo h-11 w-auto object-contain" />
        </Link>
        
        <nav className="hidden items-center gap-7 lg:flex">
          {links.map(([label, href]) => (
            <Link key={href} href={href} data-testid={`link-nav-${label}`} className="font-ui text-[14px] font-semibold text-muted-foreground transition hover:text-primary">
              {label}
            </Link>
          ))}
        </nav>
        
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1 sm:flex rounded-full border border-border/50 bg-card/50 p-1">
            <button 
              onClick={() => setAudio(!audio)} 
              aria-label={audio ? 'كتم الصوت' : 'تشغيل الصوت'} 
              data-testid="button-audio" 
              className={`rounded-full p-2.5 transition ${audio ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground'}`}
            >
              {audio ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button 
              onClick={() => setTheme(theme === 'night' ? 'parchment' : 'night')} 
              aria-label="تبديل المظهر" 
              data-testid="button-theme" 
              className="rounded-full p-2.5 text-muted-foreground transition hover:bg-primary/5 hover:text-foreground"
            >
              {theme === 'night' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          
          <button 
            onClick={() => openAuth('student', 'login')} 
            data-testid="button-login" 
            className="hidden rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-md transition hover:bg-primary/90 hover:shadow-lg sm:block font-ui"
          >
            تسجيل الدخول
          </button>
          
          <button onClick={() => setMenu(!menu)} className="rounded-md p-2 text-foreground lg:hidden" aria-label="القائمة" data-testid="button-menu">
            {menu ? <X /> : <Menu />}
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
                <Link onClick={() => setMenu(false)} key={h} href={h} className="block rounded-lg px-4 py-3.5 text-[15px] font-semibold text-foreground hover:bg-primary/5">
                  {l}
                </Link>
              ))}
            </div>
            <div className="mt-4 flex gap-2 border-t border-border pt-4">
               <button onClick={() => { setMenu(false); setTheme(theme === 'night' ? 'parchment' : 'night'); }} className="flex-1 rounded-xl border border-border bg-card py-3 flex justify-center items-center gap-2 font-bold text-sm">
                 {theme === 'night' ? <><Sun size={16}/> المظهر النهاري</> : <><Moon size={16}/> المظهر الليلي</>}
               </button>
               <button onClick={() => { setMenu(false); setAudio(!audio); }} className="flex-1 rounded-xl border border-border bg-card py-3 flex justify-center items-center gap-2 font-bold text-sm">
                 {audio ? <><Volume2 size={16}/> إيقاف التلاوة</> : <><VolumeX size={16}/> تشغيل التلاوة</>}
               </button>
            </div>
            <button onClick={() => { setMenu(false); openAuth('student', 'login'); }} className="mt-4 w-full rounded-xl bg-primary py-4 text-[15px] font-bold text-primary-foreground">
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
    <section className="relative pt-12 pb-24 md:pt-24 md:pb-32">
      <div className="absolute inset-0 -z-10 ornament opacity-70" />
      <div className="mx-auto grid max-w-[1400px] items-center gap-16 px-6 lg:grid-cols-[1.1fr_0.9fr]">
        
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <Badge>المنصة الذكية الأولى المتخصصة في متون ومنظومات علوم الشريعة</Badge>
          
          <h1 className="font-display mt-2 text-[3rem] font-bold leading-[1.1] text-foreground md:text-[4.5rem]">
            مساعدك الذكي
            <br />
            <span className="text-secondary">للحفظ المتين</span>
          </h1>
          
          <p className="font-arabic mt-8 max-w-2xl text-[1.1rem] leading-[2.2] text-muted-foreground">
            نجمع بين جلال المتون العلمية ورسوخ شروحها الأثرية، وأحدث خوارزميات الاستماع الصوتي والذكاء الاصطناعي التوليدي. صحّح قراءتك وتشكيلك لحظياً، وتلقّ الدعم والتوجيه من المشائخ المتقنين بالمنصة.
          </p>
          
          <div className="mt-10 flex flex-wrap gap-4 font-ui">
            <button 
              onClick={() => openAuth('student', 'register')} 
              data-testid="button-student-register" 
              className="flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-[15px] font-bold text-primary-foreground shadow-xl shadow-primary/20 transition hover:-translate-y-1 hover:bg-primary/90"
            >
              التسجيل كطالب
              <ArrowLeft size={18} />
            </button>
            <button 
              onClick={() => openAuth('teacher', 'register')} 
              data-testid="button-teacher-register" 
              className="rounded-full border-2 border-primary/20 bg-card px-8 py-4 text-[15px] font-bold text-primary transition hover:-translate-y-1 hover:border-primary/40 hover:bg-primary/5"
            >
              التسجيل كمعلم وموجه
            </button>
          </div>
          
          <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 font-ui text-[13px] font-bold text-muted-foreground/80">
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
      initial={{ opacity: 0, scale: 0.95 }} 
      animate={{ opacity: 1, scale: 1 }} 
      transition={{ duration: 0.7, delay: 0.2 }}
      className="relative overflow-hidden rounded-[2.5rem] border border-border/60 bg-card shadow-2xl shadow-primary/5"
    >
      {/* Simulator Header */}
      <div className="flex items-center justify-between border-b border-border/50 bg-background/50 px-8 py-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
            <Mic2 size={24} />
          </div>
          <div>
            <h3 className="font-display text-xl font-bold text-foreground">تحليل التسميع اللحظي المباشر</h3>
            <span className="font-ui mt-1 flex items-center gap-2 text-xs font-bold text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-secondary"></span>
              </span>
              جاهز للتسميع
            </span>
          </div>
        </div>
        
        <div className="flex rounded-xl bg-background p-1 font-ui text-xs font-bold border border-border/50">
          <button 
            onClick={() => setTrack('الأصول الثلاثة')} 
            className={`rounded-lg px-4 py-2 transition-all ${track === 'الأصول الثلاثة' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
          >
            الأصول الثلاثة
          </button>
          <button 
            onClick={() => setTrack('تحفة الأطفال')} 
            className={`rounded-lg px-4 py-2 transition-all ${track === 'تحفة الأطفال' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
          >
            تحفة الأطفال
          </button>
        </div>
      </div>
      
      {/* Simulator Body */}
      <div className="p-8">
        <p className="font-arabic text-sm text-muted-foreground">من متن {track}</p>
        
        <div className="mt-6 mb-8 min-h-[140px]">
          <p className="font-arabic text-3xl leading-[2.2] text-foreground">
            فَإِذَا قِيلَ لَكَ: مَنْ رَبُّكَ؟ فَقُلْ: رَبِّيَ اللَّهُ الَّذِي <span className="rounded-lg bg-secondary/15 px-2 py-1 text-secondary underline decoration-wavy decoration-secondary/50 underline-offset-8">رَبَّانِي</span> وَرَبَّى جَمِيعَ الْعَالَمِينَ بِنِعَمِهِ، وَهُوَ مَعْبُودِي لَيْسَ لِي مَعْبُودٌ سِوَاهُ.
          </p>
        </div>
        
        {/* Helper Card */}
        <div className="mb-8 rounded-2xl border border-secondary/20 bg-secondary/5 p-5">
          <div className="flex items-center gap-2 font-ui text-xs font-bold text-secondary mb-3">
            <Info size={14} />
            <span>المساعد مَتِين — توجيه فوري</span>
          </div>
          <p className="font-arabic text-sm leading-relaxed text-foreground/80">
            تنبيه صوتي دقيق: لاحظنا تخفيف حرف الباء؛ والصواب تشديدها مع الفتح «رَبَّانِي». والتربية هاهنا هي تربية النعمة والتغذية بها ظاهراً وباطناً كما قرره العلامة ابن عثيمين في شرحه.
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between font-ui">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setPlaying(!playing)} 
              className="flex h-14 items-center justify-center gap-3 rounded-full bg-primary px-6 font-bold text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90"
            >
              {playing ? <span className="text-xl leading-none tracking-tighter">||</span> : <Play size={18} fill="currentColor" />}
              <span>استمع للتسميع الذكي</span>
            </button>
            
            <button 
              onClick={() => setMic(!mic)} 
              className={`flex h-14 items-center justify-center gap-2 rounded-full border-2 px-6 font-bold transition-all ${mic ? 'border-secondary bg-secondary/10 text-secondary' : 'border-border text-muted-foreground hover:bg-background'}`}
            >
              <Mic size={18} />
              <span>ميكروفون</span>
            </button>
          </div>
          
          <button 
            onClick={() => setSpeed(speed === '١.٠×' ? '٠.٧٥×' : speed === '٠.٧٥×' ? '١.٥×' : '١.٠×')} 
            className="flex h-14 items-center justify-center gap-2 rounded-full border border-border bg-background px-5 font-bold text-muted-foreground hover:bg-muted"
          >
            <span className="text-xs">السرعة:</span>
            <span className="text-foreground">{speed}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function Features({ openAuth }: { openAuth: (a: 'student' | 'teacher', b: 'login' | 'register') => void }) {
  return (
    <section id="features" className="bg-card py-24 md:py-32 border-y border-border/40">
      <div className="mx-auto max-w-[1400px] px-6">
        <SectionTitle 
          badge="نظام التعلم المتكامل" 
          title="دليلك الشامل نحو الإتقان والرسوخ" 
          text="سبع ركائز بنيت عليها منصة متين لتجمع بين أصالة الحلقات القرآنية والتراثية، وأحدث ما توصلت إليه تقنيات الذكاء الاصطناعي التوليدي." 
        />
        
        <div className="mx-auto max-w-4xl space-y-6 mt-16">
          {features.map((f, i) => (
            <motion.article 
              key={f[0]} 
              initial={{ opacity: 0, y: 20 }} 
              whileInView={{ opacity: 1, y: 0 }} 
              transition={{ delay: i * 0.05 }} 
              viewport={{ once: true, margin: "-100px" }} 
              className="group relative flex flex-col sm:flex-row gap-6 rounded-[2rem] border border-border/60 bg-background p-8 transition-all hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5"
            >
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-secondary/10 font-display text-2xl font-bold text-secondary">
                {String(i + 1).padStart(2, '0')}
              </div>
              <div className="flex-1 pt-1">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <h3 className="font-display text-2xl font-bold text-foreground">{f[0]}</h3>
                  <span className="rounded-full bg-primary/5 px-3 py-1 font-ui text-[11px] font-bold text-primary border border-primary/10">{f[1]}</span>
                </div>
                <p className="font-arabic text-[15px] leading-8 text-muted-foreground">{f[2]}</p>
                
                {i === 6 && (
                  <button 
                    onClick={() => openAuth('student', 'register')} 
                    className="mt-6 flex items-center gap-2 rounded-full bg-secondary px-6 py-3 font-ui text-sm font-bold text-white shadow-lg shadow-secondary/20 hover:bg-secondary/90 transition-transform hover:-translate-y-0.5" 
                    data-testid="button-diagnostic-test"
                  >
                    ابدأ الاختبار التشخيصي الآن
                    <ArrowLeft size={16} />
                  </button>
                )}
              </div>
            </motion.article>
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
      try {
        await navigator.share({ text: `${text}\n${source}` });
      } catch (err) {
        // user cancelled share, ignore
      }
    } else {
      await handleCopy();
    }
  };
  
  return (
    <section className="bg-background py-24 md:py-32 text-center">
      <div className="mx-auto max-w-4xl px-6">
        <Badge>قال رسول الله ﷺ</Badge>
        
        <blockquote className="font-arabic mt-10 text-[2rem] font-bold leading-[2.2] text-foreground md:text-[3.2rem]">
          {text}
        </blockquote>
        
        <p className="font-arabic mt-8 text-lg text-secondary font-bold">
          {source}
        </p>
        
        <div className="mt-12 flex justify-center gap-4 font-ui">
          <button 
            onClick={handleCopy} 
            className="flex items-center gap-2 rounded-full border-2 border-border bg-card px-6 py-3 text-sm font-bold text-foreground transition hover:border-primary/30 hover:bg-primary/5" 
            data-testid="button-copy-hadith"
          >
            <Copy size={16} className="text-muted-foreground" />
            نسخ الحديث
          </button>
          <button 
            onClick={handleShare} 
            className="flex items-center gap-2 rounded-full border-2 border-border bg-card px-6 py-3 text-sm font-bold text-foreground transition hover:border-primary/30 hover:bg-primary/5" 
            data-testid="button-share-hadith"
          >
            <Share2 size={16} className="text-muted-foreground" />
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
    <section id="tracks" className="bg-card py-24 md:py-32 border-y border-border/40">
      <div className="mx-auto max-w-[1400px] px-6">
        <SectionTitle 
          badge="المناهج العلمية المعتمدة" 
          title="المسارات الأكاديمية النشطة" 
          text="اختر مسارك العلمي لتبدأ رحلة الحفظ المنهجي والتلقين الصوتي اللحظي عبر متون محققة على أيدي علماء الأمة." 
        />
        
        <div className="grid gap-6 md:grid-cols-3 mt-16">
          {tracks.map((t, i) => (
            <article 
              key={t.title} 
              className="group relative flex flex-col justify-between overflow-hidden rounded-[2rem] border border-border/60 bg-background p-10 transition-all hover:-translate-y-2 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10 min-h-[360px]"
            >
              <div>
                <div className="mb-8 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-card border border-border/50 text-primary transition-transform group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground">
                  <t.icon size={28} strokeWidth={1.5} />
                </div>
                
                <span className="font-ui block text-[11px] font-bold text-secondary mb-3">{t.badge}</span>
                <h3 className="font-display text-[1.75rem] font-bold text-foreground mb-4">{t.title}</h3>
                <p className="font-arabic text-[15px] leading-8 text-muted-foreground">{t.desc}</p>
              </div>
              
              <div className="mt-8 border-t border-border/50 pt-6">
                <span className="font-ui text-[13px] font-bold text-primary flex items-center gap-2 group-hover:text-secondary transition-colors">
                  عرض تفاصيل المنهج
                  <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
                </span>
                <p className="absolute bottom-6 left-8 font-ui text-[11px] font-bold text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">{t.hover}</p>
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
    <section id="methodology" className="bg-background py-24 md:py-32">
      <div className="mx-auto max-w-[1400px] px-6">
        <SectionTitle 
          badge="الهندسة البرمجية والأصالة التراثية" 
          title="كيف تعمل منصة مَتِين؟" 
          text="معمارية متكاملة ثلاثية الأركان تضم دقة الفتوى وصحة التلاوة وحفظ المتون دون أي خلل." 
        />
        
        <div className="grid gap-6 md:grid-cols-3 mt-16">
          {items.map((x) => (
            <div key={x.num} className="rounded-[2rem] border border-border/60 bg-card p-10 transition-colors hover:border-primary/30">
              <span className="font-display inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground shadow-lg shadow-primary/20">
                {x.num}
              </span>
              <h3 className="font-display mt-8 text-2xl font-bold text-foreground">{x.title}</h3>
              <p className="font-arabic mt-5 text-[15px] leading-8 text-muted-foreground">{x.desc}</p>
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
    <section id="faq" className="bg-card py-24 md:py-32 border-t border-border/40">
      <div className="mx-auto max-w-3xl px-6">
        <SectionTitle 
          badge="إجابات شافية" 
          title="الأسئلة الشائعة" 
          text="كل ما تود معرفته عن آلية الحفظ، ودقة الذكاء الاصطناعي، والإشراف الشرعي." 
        />
        
        <div className="space-y-4 mt-12">
          {faqs.map((f, i) => (
            <div key={f[0]} className={`overflow-hidden rounded-2xl border transition-colors ${active === i ? 'border-primary/30 bg-background shadow-lg shadow-primary/5' : 'border-border/60 bg-background/50 hover:bg-background'}`}>
              <button 
                onClick={() => setActive(active === i ? null : i)} 
                aria-expanded={active === i} 
                className="flex w-full items-center justify-between gap-4 p-6 text-right font-display text-[1.1rem] font-bold text-foreground" 
                data-testid={`button-faq-${i}`}
              >
                {f[0]}
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform duration-300 ${active === i ? 'bg-primary/10 text-primary rotate-180' : 'bg-muted text-muted-foreground'}`}>
                  <ChevronDown size={18} />
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
                    <p className="font-arabic px-6 pb-7 text-[15px] leading-8 text-muted-foreground border-t border-border/40 pt-5 mt-2 mx-6">
                      {f[1]}
                    </p>
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
    <section className="bg-background py-24 md:py-32">
      <div className="mx-6 mx-auto max-w-[1400px] overflow-hidden rounded-[3rem] bg-primary relative">
        <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTU0LjYyNyAxLjMyM0EzMCAzMCAwIDAgMCAzMCAwaHY2MGEzMCAzMCAwIDAgMCAyNC42MjctNTguNjc3eiIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==')] bg-[length:60px_60px]"></div>
        
        <div className="relative px-8 py-20 text-center md:px-24 md:py-28">
          <div className="mx-auto max-w-4xl">
            <h2 className="font-display text-[2.5rem] font-bold leading-[1.2] text-primary-foreground md:text-[3.5rem]">
              ابدأ رحلتك المباركة في حفظ متون ومنظومات علوم الشريعة اليوم
            </h2>
            <p className="font-arabic mx-auto mt-8 max-w-2xl text-lg leading-8 text-primary-foreground/80">
              كن من أوائل المنضمين لضبط محفوظاتك وتأسيس علمك المنهجي عبر أحدث تقنيات الذكاء الاصطناعي الموجهة لخدمة العلوم الشرعية.
            </p>
            <button 
              onClick={() => openAuth('student', 'register')} 
              className="font-ui mt-12 inline-flex items-center gap-3 rounded-full bg-secondary px-10 py-5 text-[17px] font-bold text-white shadow-2xl shadow-secondary/30 transition hover:-translate-y-1 hover:bg-secondary/90 hover:shadow-secondary/50" 
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
          <h3 className="font-display text-lg font-bold text-foreground">مسارات العلم</h3>
          <div className="font-ui mt-6 flex flex-col space-y-4 text-sm font-semibold text-muted-foreground">
            <a href="#tracks" className="transition hover:text-primary">مسار العقيدة</a>
            <a href="#tracks" className="transition hover:text-primary">مسار التجويد والقراءات</a>
            <a href="#tracks" className="transition hover:text-primary">مسار الحديث</a>
          </div>
        </div>
        
        <div>
          <h3 className="font-display text-lg font-bold text-foreground">في المنصة</h3>
          <div className="font-ui mt-6 flex flex-col space-y-4 text-sm font-semibold text-muted-foreground">
            <a href="#smart-emulator" className="transition hover:text-primary">المحاكي الصوتي التفاعلي</a>
            <a href="#methodology" className="transition hover:text-primary">منهجية العمل</a>
            <a href="#faq" className="transition hover:text-primary">الأسئلة الشائعة</a>
          </div>
        </div>
        
        <div>
          <h3 className="font-display text-lg font-bold text-foreground">الروابط السريعة</h3>
          <div className="font-ui mt-6 flex flex-col space-y-4 text-sm font-semibold text-muted-foreground">
            <Link href="/about" className="transition hover:text-primary">عن المنصة</Link>
            <button onClick={() => window.scrollTo(0, 0)} className="text-right transition hover:text-primary">العودة للأعلى</button>
          </div>
        </div>
        
      </div>
      
      <div className="mx-auto mt-16 max-w-[1400px] border-t border-border/50 px-6 pt-8 text-center md:flex md:items-center md:justify-between md:text-right">
        <p className="font-ui text-[13px] font-bold text-muted-foreground">
          © 2026 منصة متين (Mateen) التعليمية. جميع الحقوق محفوظة لخدمة علوم الشريعة.
        </p>
        <div className="font-ui mt-4 flex justify-center gap-4 text-[12px] font-bold text-muted-foreground/60 md:mt-0">
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4 backdrop-blur-md" 
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
        className="w-full max-w-[480px] overflow-hidden rounded-[2.5rem] border border-border/50 bg-background shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border/50 px-8 py-6 bg-card/50">
          <div>
            <p className="font-ui text-[11px] font-bold text-secondary mb-1">منصة مَتِين</p>
            <h2 className="font-display text-2xl font-bold text-foreground">{state.mode === 'login' ? 'مرحباً بعودتك' : 'ابدأ رحلتك العلمية'}</h2>
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
          <div className="font-ui flex rounded-xl bg-card p-1.5 border border-border/60">
            <button 
              onClick={() => setState({ ...state, tab: 'student' })} 
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-3 text-[13px] font-bold transition-all ${state.tab === 'student' ? 'bg-background text-primary shadow-sm border border-border/40' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <UserCheck size={16} />
              حساب طالب علم
            </button>
            <button 
              onClick={() => setState({ ...state, tab: 'teacher' })} 
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-3 text-[13px] font-bold transition-all ${state.tab === 'teacher' ? 'bg-background text-primary shadow-sm border border-border/40' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <PenTool size={16} />
              طلب انضمام معلم/موجه
            </button>
          </div>
          
          <div className="font-ui mt-8 flex justify-center gap-8 text-[14px]">
            <button 
              onClick={() => setState({ ...state, mode: 'login' })} 
              className={`pb-2 border-b-2 transition-all ${state.mode === 'login' ? 'border-primary font-bold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              تسجيل الدخول
            </button>
            <button 
              onClick={() => setState({ ...state, mode: 'register' })} 
              className={`pb-2 border-b-2 transition-all ${state.mode === 'register' ? 'border-primary font-bold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              إنشاء حساب
            </button>
          </div>
          
          {sent ? (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mt-8 rounded-3xl border border-primary/20 bg-primary/5 p-10 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary/10 text-secondary mb-5">
                <Check size={32} />
              </div>
              <p className="font-display text-2xl font-bold text-foreground">تم استلام طلبك</p>
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
        className="flex h-full w-full max-w-[420px] flex-col border-l border-border bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border/50 px-8 py-6 bg-background/50">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary/10 text-secondary">
              <Sparkles size={20} />
            </div>
            <div>
              <p className="font-ui text-[11px] font-bold text-muted-foreground mb-1">المساعد التعريفي</p>
              <h2 className="font-display text-2xl font-bold text-foreground">اسأل مَتِين</h2>
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
          <div className="space-y-3 mb-8">
            {qs.map((q, i) => (
              <button 
                key={q} 
                onClick={() => setAnswer(answers[i])} 
                className="flex w-full items-center justify-between rounded-2xl border border-border/60 bg-background p-4 text-right text-[14px] font-bold text-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary" 
                data-testid={`button-assistant-question-${i}`}
              >
                {q}
                <ChevronLeft size={16} className="text-muted-foreground/50 shrink-0" />
              </button>
            ))}
          </div>
          
          <div className="relative min-h-[200px] rounded-3xl border border-secondary/20 bg-secondary/5 p-6">
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
                  <p className="font-ui text-sm font-bold">اختر سؤالاً لتتعرف على مَتِين</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        
        <div className="border-t border-border/50 bg-background/80 p-6 backdrop-blur-md">
          <form 
            onSubmit={e => { 
              e.preventDefault(); 
              if (input.trim()) setAnswer('للحصول على إجابات مخصصة والاستفادة الكاملة من قدرات المساعد الذكي وتسميع المتون، يرجى تسجيل الدخول إلى حسابك.'); 
              setInput(''); 
            }} 
            className="relative font-ui"
          >
            <input 
              value={input} 
              onChange={e => setInput(e.target.value)} 
              className="w-full rounded-2xl border border-border bg-card py-4 pl-14 pr-5 text-[14px] outline-none transition focus:border-primary focus:ring-1 focus:ring-primary shadow-sm" 
              placeholder="اكتب سؤالك هنا..." 
              data-testid="input-assistant"
            />
            <button 
              aria-label="إرسال السؤال" 
              className={`absolute left-2 top-2 flex h-10 w-10 items-center justify-center rounded-xl transition-all ${input.trim() ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground/50'}`}
              data-testid="button-send-assistant"
            >
              <Send size={18} className={input.trim() ? '-ml-1' : ''} />
            </button>
          </form>
        </div>
      </motion.aside>
    </div>
  );
}
