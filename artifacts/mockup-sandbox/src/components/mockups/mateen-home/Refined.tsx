import './_group.css';
import { type ReactNode } from 'react';
import { useState } from 'react';
import { Link, getGetCatalogQueryKey, getGetStudyTextQueryKey, useGetCatalog, useGetStudyText } from './_data';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ArrowLeft, BookOpen, BookMarked, Check, Copy, Eye, EyeOff, Link2, Lock, Menu, Search, Share2, Sparkles, X } from 'lucide-react';
import { Logo, ErrorState, SkeletonBlock } from './_bits';
import { FAQ as ORIGINAL_FAQ, TEACHER_INTENT_KEY, num, usePageMeta } from './_lib';
import { cn } from '@/lib/utils';
import BookMascot from './_mascot';

const FAQ = ORIGINAL_FAQ.map((item) => {
  if (item.q === 'ما المتاح اليوم؟') return { ...item, a: 'الأربعون النووية في مسار الحديث، وتحفة الأطفال في مسار التجويد والقراءات. نواقض الإسلام والقواعد الأربع ما زالا بوسم «قريباً».' };
  if (item.q === 'هل يوجد تسميع صوتي أو اختبارات؟') return { ...item, a: 'معاينة القراءة في هذه الصفحة ليست تسميعاً صوتياً ولا تقييماً لحفظك. لا ننسب إليك درجة حفظ لم تُختبر، ولا نعرض نتائج غير موثّقة.' };
  if (item.q === 'كيف أسجّل كمعلم؟') return { ...item, a: 'أنشئ حساباً واختر «معلم». احفظ ملفك وارفع وثيقة مؤهلاتك الخاصة بصيغة PDF ثم أرسل الطلب للمراجعة. تبقى الوثيقة خاصة ولا تُنشر، ولا يستقبل المعلم إحالات قبل اعتماد المنصة له.' };
  return item;
});

function Reveal({ children, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return <div className={className}>{children}</div>;
}

const NAV = [
  { id: 'about', label: 'عن المنصة', href: '/about' },
  { id: 'simulator', label: 'المحاكي التعليمي', href: '#simulator' },
  { id: 'features', label: 'المزايا', href: '#features' },
  { id: 'tracks', label: 'المتون', href: '#tracks' },
  { id: 'method', label: 'منهجيتنا', href: '#method' },
  { id: 'faq', label: 'الأسئلة الشائعة', href: '#faq' },
];

function NavLink({ n, onClick }: { n: (typeof NAV)[number]; onClick?: () => void }) {
  const cls = 'font-ui text-sm font-semibold text-foreground/75 transition-colors hover:text-secondary';
  return n.href.startsWith('#')
    ? <a href={n.href} onClick={onClick} className={cls}>{n.label}</a>
    : <Link href={n.href} className={cls} onClick={onClick}>{n.label}</Link>;
}

function Header() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="sticky top-0 z-40 border-b border-secondary/15 bg-[#f4e7d1]">
        <div className="mx-auto flex min-h-12 max-w-7xl items-center justify-center gap-2 px-4 text-primary">
          <BookMascot size={38} mood="calm" title="مَتِين، رفيق القراءة" still />
          <p className="font-ui text-xs font-bold sm:text-sm">أهلًا بك في مجلس القراءة <span className="font-arabic font-medium text-primary/70">— نمضي في المتن على مهل</span></p>
        </div>
      </div>
      <header className="sticky top-12 z-30 border-b border-border/70 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-2.5 md:px-10">
          <Link href="/" aria-label="مَتِين"><Logo className="h-11" /></Link>
          <nav className="hidden items-center gap-6 xl:flex" aria-label="التنقل">{NAV.map((n) => <NavLink key={n.id} n={n} />)}</nav>
          <div className="flex items-center gap-2">
            <Link href="/sign-in" className="hidden rounded-full border border-primary/30 px-4 py-2 font-ui text-sm font-bold text-primary transition hover:bg-primary/5 sm:block" data-testid="link-signin">دخول</Link>
            <Link href="/sign-up" className="hidden rounded-full bg-secondary px-5 py-2 font-ui text-sm font-bold text-secondary-foreground transition hover:-translate-y-0.5 sm:block" data-testid="link-signup-header">ابدأ كطالب</Link>
            <button className="rounded-full border border-border p-2 lg:hidden" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="القائمة" data-testid="button-menu">{open ? <X size={19} /> : <Menu size={19} />}</button>
          </div>
        </div>
        {open && <div className="border-t bg-background px-5 py-5 lg:hidden">
          <nav className="flex flex-col gap-4">{NAV.map((n) => <NavLink key={n.id} n={n} onClick={() => setOpen(false)} />)}</nav>
          <div className="mt-5 flex gap-3">
            <Link href="/sign-in" className="flex-1 rounded-full border border-primary/40 py-2.5 text-center font-ui text-sm font-bold text-primary">دخول</Link>
            <Link href="/sign-up" className="flex-1 rounded-full bg-secondary py-2.5 text-center font-ui text-sm font-bold text-secondary-foreground">ابدأ كطالب</Link>
          </div>
        </div>}
      </header>
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#f4e7d1]">
      <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[38%] border-r border-primary/10 bg-[radial-gradient(ellipse_at_25%_40%,hsl(var(--secondary)/.09),transparent_68%)] lg:block" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-5 pb-16 pt-12 md:px-10 md:pb-24 md:pt-16 lg:grid-cols-[1.06fr_.94fr] lg:gap-12">
        <div className="max-w-2xl">
          <Reveal><p className="inline-flex items-center gap-2 rounded-full border border-secondary/25 bg-background/70 px-4 py-2 font-ui text-xs font-bold tracking-wide text-secondary sm:text-sm"><Sparkles size={15} /> فضاء عربي لطلاب المتون</p></Reveal>
          <Reveal delay={0.08}><h1 className="mt-6 max-w-[15ch] font-display text-[2.65rem] font-extrabold leading-[1.32] text-primary sm:text-6xl lg:text-[4.15rem]">اقرأ المتن،<br /><span className="text-secondary">واعرف موضعك.</span></h1></Reveal>
          <Reveal delay={0.16}><p className="mt-6 max-w-xl font-arabic text-lg leading-[2] text-foreground/80 md:text-xl">مساحة هادئة لدراسة المتون العربية: نصٌّ مشكول، إحالة إلى مصدره، وعلامة تعيدك إلى حيث توقفت.</p></Reveal>
          <Reveal delay={0.23}><div className="mt-8 flex flex-wrap gap-3">
            <Link href="/sign-up" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-secondary px-7 py-3 font-ui font-bold text-secondary-foreground shadow-[0_12px_30px_-18px_hsl(var(--secondary))] transition hover:-translate-y-0.5" data-testid="link-start-student">ابدأ كطالب <ArrowLeft size={17} /></Link>
            <Link href="/sign-up" onClick={() => sessionStorage.setItem(TEACHER_INTENT_KEY, 'teacher')} className="inline-flex min-h-12 items-center rounded-full border border-primary/40 bg-background/35 px-7 py-3 font-ui font-bold text-primary transition hover:bg-background" data-testid="link-start-teacher">أنا معلّم</Link>
          </div></Reveal>
          <Reveal delay={0.3}><div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-primary/15 pt-5 font-ui text-xs font-semibold text-primary/70">
            <span className="inline-flex items-center gap-2"><BookOpen size={15} className="text-secondary" /> قراءة ومراجعة ذاتية</span>
            <span>لا ننسب إليك درجة حفظ لم تُختبر</span>
          </div></Reveal>
        </div>
        <Reveal delay={0.12} className="min-w-0">
          <div className="relative mx-auto flex min-h-[340px] w-full max-w-[510px] items-center justify-center overflow-hidden rounded-[2rem] border border-primary/10 bg-[#ead9bc] px-5 py-7 sm:min-h-[420px] md:px-8">
            <div className="absolute inset-4 rounded-[1.45rem] border border-primary/15" aria-hidden="true" />
            <div className="absolute right-7 top-8 h-24 w-24 rounded-full border border-secondary/20 sm:right-12 sm:top-12 sm:h-36 sm:w-36" aria-hidden="true" />
            <div className="relative z-10 flex w-full flex-col items-center text-center">
              <div className="mateen-bob"><BookMascot size={190} title="مَتِين، كتابك الودود" /></div>
              <div className="-mt-1 rounded-2xl border border-primary/10 bg-background/90 px-5 py-3 shadow-sm">
                <p className="font-display text-lg font-bold text-primary">رفيقٌ للقراءة المتأنية</p>
                <p className="mt-1 font-arabic text-sm text-muted-foreground">المتن ومصدره، بلا ادعاء</p>
              </div>
            </div>
            <span className="absolute bottom-7 left-7 font-arabic text-sm text-primary/50">بِالعلمِ تُبنى الخُطى</span>
          </div>
        </Reveal>
      </div>
      <div className="h-2 bg-secondary/80" />
    </section>
  );
}

function BookShelf() {
  return (
    <section aria-labelledby="shelf-title" className="relative overflow-hidden bg-background py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <Reveal><div className="flex flex-col gap-4 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="font-ui text-xs font-bold uppercase tracking-[.16em] text-secondary">على رفّ مَتِين</p><h2 id="shelf-title" className="mt-2 font-display text-3xl font-bold text-primary md:text-4xl">متونٌ نقرؤها بعناية</h2></div>
          <p className="max-w-md font-arabic text-base leading-loose text-muted-foreground">نبدأ بما هو متاح في المنصة اليوم؛ وما لم يكتمل بعد، نترك له مكانًا دون أن ندّعي جاهزيته.</p>
        </div></Reveal>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <Reveal><article className="group flex min-w-0 items-center gap-5 rounded-[1.65rem] border border-border bg-[#fbf5e9] p-4 sm:gap-7 sm:p-6">
            <div className="w-[34%] max-w-[176px] shrink-0 overflow-hidden rounded-xl bg-[#e7d7bd] shadow-[0_15px_28px_-18px_hsl(var(--primary)/.7)]">
              <img src="/__mockup/images/mateen-home/nawawi-mateen.png" alt="غلاف الأربعين النووية" className="block h-auto w-full object-contain transition-transform duration-500 group-hover:scale-[1.025]" />
            </div>
            <div className="min-w-0 py-2">
              <span className="font-ui text-xs font-bold text-secondary">متاح للقراءة</span>
              <h3 className="mt-2 font-display text-xl font-bold leading-relaxed text-primary sm:text-2xl">الأربعون النووية</h3>
              <p className="mt-2 font-arabic leading-[1.9] text-foreground/70">مدخل إلى أحاديث جامعة، مع متابعة موضع القراءة وعلامات المراجعة.</p>
              <Link href="/sign-up" className="mt-4 inline-flex items-center gap-2 font-ui text-sm font-bold text-secondary underline decoration-secondary/40 underline-offset-4">ابدأ القراءة <ArrowLeft size={15} /></Link>
            </div>
          </article></Reveal>
          <Reveal delay={0.08}><article className="group flex min-w-0 items-center gap-5 rounded-[1.65rem] border border-border bg-[#f0e7d7] p-4 sm:gap-7 sm:p-6">
            <div className="w-[34%] max-w-[176px] shrink-0 overflow-hidden rounded-xl bg-[#e2d4bc] shadow-[0_15px_28px_-18px_hsl(var(--primary)/.7)]">
              <img src="/__mockup/images/mateen-home/tuhfa-mateen.png" alt="غلاف تحفة الأطفال" className="block h-auto w-full object-contain transition-transform duration-500 group-hover:scale-[1.025]" />
            </div>
            <div className="min-w-0 py-2">
              <span className="font-ui text-xs font-bold text-secondary">متاح للقراءة</span>
              <h3 className="mt-2 font-display text-xl font-bold leading-relaxed text-primary sm:text-2xl">تحفة الأطفال</h3>
              <p className="mt-2 font-arabic leading-[1.9] text-foreground/70">منظومة في التجويد للإمام سليمان الجمزوري؛ نقرأ أبوابها خطوةً خطوة.</p>
              <Link href="/sign-up" className="mt-4 inline-flex items-center gap-2 font-ui text-sm font-bold text-secondary underline decoration-secondary/40 underline-offset-4">تعرّف إلى المسار <ArrowLeft size={15} /></Link>
            </div>
          </article></Reveal>
        </div>
      </div>
    </section>
  );
}

function Simulator() {
  const q = useGetStudyText('nawawi', { query: { enabled: true, queryKey: getGetStudyTextQueryKey('nawawi'), retry: 1 } });
  const [i, setI] = useState(0);
  const [hide, setHide] = useState(false);
  const [shown, setShown] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const hs = q.data?.hadiths ?? [];
  const h = hs[Math.min(i, Math.max(hs.length - 1, 0))];
  const pick = (n: number) => { setI(n); setShown(new Set()); };
  const words = h ? h.text.split(/\s+/).filter(Boolean) : [];
  const payload = h ? `${h.text}\n\nالمصدر: ${q.data?.title}، صفحة ${h.sourcePage}\n${h.sourceUrl}` : '';
  const copy = async () => { try { await navigator.clipboard.writeText(payload); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* clipboard unavailable */ } };
  const share = async () => { if (navigator.share) { try { await navigator.share({ title: 'حديث من الأربعين النووية', text: payload }); } catch { /* cancelled */ } } else await copy(); };
  return (
    <section id="simulator" className="scroll-mt-28 bg-primary py-16 text-primary-foreground md:py-24">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <Reveal><div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div><p className="font-ui text-xs font-bold tracking-[.14em] text-[#f2c98c]">تجربة القراءة</p><h2 className="mt-3 max-w-3xl font-display text-3xl font-bold leading-[1.45] md:text-5xl">تأنَّ في النص، وارجع إلى موضعك</h2></div>
          <p className="max-w-sm border-r border-white/30 pr-4 font-arabic text-base leading-loose text-primary-foreground/80">معاينة تعليمية للقراءة وتغطية الكلمات فقط؛ ليست تسميعًا صوتيًا ولا تقييمًا للحفظ.</p>
        </div></Reveal>
        <div className="mt-9 grid gap-5 lg:grid-cols-[230px_1fr]">
          <div className="max-h-[22rem] overflow-y-auto rounded-2xl border border-white/15 bg-white/5 p-3" role="tablist" aria-label="الأحاديث">
            {q.isLoading ? <div className="space-y-2">{[0, 1, 2, 3].map((k) => <div key={k} className="h-10 animate-pulse rounded-lg bg-white/15" />)}</div>
              : hs.slice(0, 12).map((x, k) => <button key={x.id} role="tab" aria-selected={k === i} onClick={() => pick(k)} className={cn('mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right font-ui text-sm transition', k === i ? 'bg-background text-primary' : 'text-primary-foreground hover:bg-white/10')}>
                <span className="font-bold">{num(x.number)}</span><span className="truncate">{x.title}</span>
              </button>)}
            {!q.isLoading && !q.isError && hs.length === 0 && <p className="p-3 font-arabic text-sm leading-loose text-primary-foreground/80">لا توجد عينة نصية متاحة الآن.</p>}
          </div>
          <div className="min-h-64 rounded-[1.6rem] bg-background p-5 text-foreground sm:p-8 md:p-10">
            {q.isError ? <ErrorState message="تعذّر جلب النص من مصدره الآن. لا نعرض اقتباسًا بديلًا." onRetry={() => q.refetch()} />
              : q.isLoading ? <div className="space-y-4"><SkeletonBlock className="h-7" /><SkeletonBlock className="h-28" /></div>
              : h ? <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-display text-xl font-bold text-primary">الحديث {num(h.number)}: {h.title}</h3>
                  <button onClick={() => { setHide(!hide); setShown(new Set()); }} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/30 px-4 py-2 font-ui text-xs font-bold text-primary" aria-pressed={hide}>{hide ? <Eye size={14} /> : <EyeOff size={14} />}{hide ? 'إظهار الكل' : 'غطِّ الكلمات'}</button>
                </div>
                <p className="hadith-text mt-6 text-xl leading-[2.2] sm:text-2xl">{words.map((w, k) => hide && !shown.has(k)
                  ? <button key={k} onClick={() => setShown(new Set(shown).add(k))} className="mx-1 inline-block min-w-10 rounded-md bg-primary/20 px-1 align-middle text-transparent" aria-label="كلمة مغطاة، اضغط لإظهارها">{w}</button>
                  : <span key={k}> {w}</span>)}</p>
                <div className="mt-6 flex flex-wrap items-center gap-3 border-t pt-5 font-ui text-sm">
                  <a href={h.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-muted-foreground underline underline-offset-4 hover:text-secondary"><Link2 size={14} />{q.data?.title}، صفحة {num(h.sourcePage)}</a><span className="flex-1" />
                  <button onClick={copy} className="inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 font-bold hover:bg-muted">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'تم النسخ' : 'نسخ'}</button>
                  <button onClick={share} className="inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 font-bold hover:bg-muted"><Share2 size={14} />مشاركة</button>
                </div>
                {q.data?.sourceStatus === 'retrieved_pending_review' && <p className="mt-4 rounded-xl border border-secondary/40 bg-secondary/10 p-3 font-ui text-xs leading-relaxed">النص منقول من مصدره وقيد المراجعة العلمية، فلا يُعتمد مرجعًا.</p>}
              </> : <p className="font-arabic text-lg leading-loose text-muted-foreground">لا نص متاحًا حاليًا من المصدر. لا نعرض عيّنات من خارجه.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  { n: '01', title: 'النص مع إحالة واضحة', copy: 'تعرّف إلى الكتاب والصفحة والرابط، ثم راجع المصدر بنفسك.' },
  { n: '02', title: 'علامتك تبقى لك', copy: 'احفظ موضع التوقف واجمع ما تريد العودة إليه في مراجعاتك.' },
  { n: '03', title: 'بحث وقراءة مريحة', copy: 'ابحث في النص، واختر حجم الخط الأنسب لجلسة القراءة.' },
  { n: '04', title: 'متابعة بلا ادعاء', copy: 'تعلّم بنفسك ما درست؛ لا ننسب إليك درجة حفظ لم تُختبر.' },
];

function Features() {
  return <section id="features" className="scroll-mt-28 bg-[#f0e7d7] py-16 md:py-24">
    <div className="mx-auto max-w-7xl px-5 md:px-10">
      <Reveal><div className="grid gap-5 md:grid-cols-[.8fr_1.2fr] md:items-end">
        <div><p className="font-ui text-xs font-bold tracking-[.14em] text-secondary">تجربة دراسة بسيطة</p><h2 className="mt-3 font-display text-3xl font-bold leading-relaxed text-primary md:text-4xl">ما يعينك على<br className="hidden md:block" /> مواصلة القراءة</h2></div>
        <p className="max-w-xl font-arabic text-lg leading-[2] text-foreground/75">أدوات صغيرة تساعد على التنظيم، وتترك الفهم والتحصيل في موضعهما الصحيح: بين الطالب ومعلمه.</p>
      </div></Reveal>
      <div className="mt-10 grid gap-0 border-y border-primary/15 md:grid-cols-4 md:divide-x md:divide-x-reverse md:divide-primary/15">
        {FEATURES.map((f, i) => <Reveal key={f.n} delay={i * .05}><article className="min-h-[190px] border-b border-primary/15 py-6 md:border-b-0 md:px-5 md:py-7 first:md:pr-0 last:md:pl-0">
          <span className="font-ui text-xs font-bold tracking-[.15em] text-secondary">{f.n}</span><h3 className="mt-4 font-display text-xl font-bold text-primary">{f.title}</h3><p className="mt-3 font-arabic leading-[1.9] text-muted-foreground">{f.copy}</p>
        </article></Reveal>)}
      </div>
      <p className="mt-6 border-r-2 border-secondary/50 pr-4 font-arabic text-sm leading-loose text-muted-foreground">قيد الإعداد وغير متاح بعد: التسميع الصوتي، المساعد العلمي المقيّد بالمصادر، والاختبارات. نعلن عنها حين تجهز فعلًا.</p>
    </div>
  </section>;
}

function Tracks() {
  const q = useGetCatalog({ query: { enabled: true, queryKey: getGetCatalogQueryKey() } });
  return <section id="tracks" className="scroll-mt-28 py-16 md:py-24">
    <div className="mx-auto max-w-7xl px-5 md:px-10">
      <Reveal><div className="flex items-end justify-between gap-5 border-b border-border pb-6"><div><p className="font-ui text-xs font-bold tracking-[.14em] text-secondary">المسارات</p><h2 className="mt-3 font-display text-3xl font-bold text-primary md:text-4xl">من أين تبدأ؟</h2></div><p className="hidden max-w-sm font-arabic leading-loose text-muted-foreground sm:block">المتاح الآن ظاهر كما هو؛ والمسارات الأخرى تنتظر إعدادها.</p></div></Reveal>
      <div className="mt-6 divide-y divide-border">
        {q.isLoading ? [0, 1, 2].map((k) => <SkeletonBlock key={k} className="my-3 h-24" />) : q.isError ? <ErrorState message="تعذّر تحميل المسارات." onRetry={() => q.refetch()} />
          : q.data?.map((t, k) => {
            const available = t.status === 'available';
            return <Reveal key={t.id} delay={k * .04}><article className="grid min-w-0 gap-3 py-5 sm:grid-cols-[1fr_auto] sm:items-center" data-testid={`card-landing-track-${t.id}`}>
              <div className="flex min-w-0 items-center gap-4">
                <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-2xl', available ? 'bg-secondary/10 text-secondary' : 'bg-muted text-muted-foreground')}>{available ? <BookMarked size={21} /> : <Lock size={19} />}</span>
                <div className="min-w-0"><p className="font-ui text-xs font-semibold text-secondary">{t.track} · {t.level}</p><h3 className="mt-1 font-display text-xl font-bold text-primary">{t.title}</h3><p className="mt-1 font-arabic leading-relaxed text-muted-foreground">{t.description}</p></div>
              </div>
              <div className="flex items-center gap-3 pr-16 sm:pr-0"><span className={cn('rounded-full px-3 py-1 font-ui text-xs font-bold', available ? 'bg-secondary/10 text-secondary' : 'border border-dashed border-muted-foreground/40 text-muted-foreground')}>{available ? 'متاح' : 'قريبًا'}</span>{available && <Link href="/sign-up" className="font-ui text-sm font-bold text-secondary underline underline-offset-4">ابدأ</Link>}</div>
            </article></Reveal>;
          })}
      </div>
    </div>
  </section>;
}

const STEPS = [
  { title: 'اقرأ النص', copy: 'نص مشكول منسوب إلى مصدره وصفحته.' },
  { title: 'ضع علامتك', copy: 'علّم ما يحتاج عودة، وتابع موضع وقوفك.' },
  { title: 'ارجع وراجع', copy: 'اجمع علاماتك في مساحة للمراجعة.' },
  { title: 'استعن بمعلمك', copy: 'التقنية أداة مساعدة، وليست بديلًا عن الشيخ والمعلم.' },
];

function Method() {
  return <section id="method" className="scroll-mt-28 border-y border-border bg-[#fbf5e9] py-16 md:py-24">
    <div className="mx-auto grid max-w-7xl gap-9 px-5 md:px-10 lg:grid-cols-[.8fr_1.2fr]">
      <Reveal><div className="lg:sticky lg:top-36"><p className="font-ui text-xs font-bold tracking-[.14em] text-secondary">على بيّنة</p><h2 className="mt-3 font-display text-3xl font-bold leading-relaxed text-primary md:text-4xl">قراءة أمينة،<br />ومصدرٌ معروف</h2><p className="mt-5 max-w-md font-arabic text-lg leading-[2] text-foreground/75">لا إفتاء ولا اجتهاد آلي. ما لا يتصل بالمصادر يحال إلى أهل العلم؛ والمحتوى قيد المراجعة لا يغني عن الرجوع إلى أصله ومعلمك.</p></div></Reveal>
      <ol className="divide-y divide-border border-y border-border">
        {STEPS.map((s, i) => <Reveal key={s.title} delay={i * .05}><li className="flex gap-5 py-5 sm:gap-7"><span className="font-ui text-sm font-bold text-secondary">۰{i + 1}</span><div><h3 className="font-display text-xl font-bold text-primary">{s.title}</h3><p className="mt-1 font-arabic leading-loose text-muted-foreground">{s.copy}</p></div></li></Reveal>)}
      </ol>
    </div>
  </section>;
}

function Faq() {
  return <section id="faq" className="scroll-mt-28 py-16 md:py-24"><div className="mx-auto max-w-3xl px-5 md:px-10">
    <Reveal><p className="text-center font-ui text-xs font-bold tracking-[.14em] text-secondary">لديك سؤال؟</p><h2 className="mt-3 text-center font-display text-3xl font-bold text-primary md:text-4xl">إجابات واضحة</h2></Reveal>
    <Accordion type="single" collapsible className="mt-8">{FAQ.map((f, i) => <AccordionItem key={f.q} value={`q${i}`}><AccordionTrigger className="text-right font-display text-lg font-bold">{f.q}</AccordionTrigger><AccordionContent className="font-arabic text-lg leading-loose text-muted-foreground">{f.a}</AccordionContent></AccordionItem>)}</Accordion>
  </div></section>;
}

function Closing() {
  return <section className="bg-[#ead9bc] py-14 md:py-20"><div className="mx-auto flex max-w-7xl flex-col items-center gap-7 px-5 text-center sm:flex-row sm:text-right md:px-10">
    <BookMascot size={106} mood="cheer" pose="happy" title="مَتِين يدعوك للقراءة" /><div className="flex-1"><p className="font-ui text-xs font-bold tracking-[.14em] text-secondary">على مهلٍ، وبخطوةٍ واضحة</p><h2 className="mt-2 font-display text-3xl font-bold text-primary md:text-4xl">ابدأ من المتن المتاح</h2><p className="mt-3 font-arabic leading-loose text-foreground/75">نقرأ ما اكتمل، ونصرّح بما لا يزال قيد الإعداد.</p></div>
    <div className="flex flex-wrap justify-center gap-3"><Link href="/sign-up" className="inline-flex min-h-12 items-center rounded-full bg-secondary px-7 py-3 font-ui font-bold text-secondary-foreground transition hover:-translate-y-0.5" data-testid="link-cta-student">ابدأ كطالب</Link><Link href="/about" className="inline-flex min-h-12 items-center rounded-full border border-primary/35 px-7 py-3 font-ui font-bold text-primary" data-testid="link-cta-about">عن مَتِين</Link></div>
  </div></section>;
}

function Footer() {
  return <footer className="border-t border-border bg-background py-8"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-5 md:flex-row md:px-10">
    <Logo className="h-10" /><p className="max-w-lg text-center font-arabic text-sm leading-loose text-muted-foreground">المحتوى المعروض قيد المراجعة العلمية؛ راجع مصادره ولا تجعله بديلًا عن أهل العلم.</p><div className="flex gap-5 font-ui text-sm font-semibold"><Link href="/about">عن المنصة</Link><Link href="/sign-in">دخول</Link><a href="#faq" aria-label="الأسئلة"><Search size={15} className="inline" /> الأسئلة</a></div>
  </div></footer>;
}

export default function Refined() {
  usePageMeta('مَتِين | فضاء عربي لدراسة المتون العلمية', 'اقرأ المتون المتاحة مع إحالاتها، وتابع موضع توقفك وعلاماتك في منصة مَتِين.');
  return <div dir="rtl" className="min-h-[100dvh] min-w-0 overflow-x-clip bg-background">
    <Header />
    <main><Hero /><BookShelf /><Features /><Simulator /><Tracks /><Method /><Faq /><Closing /></main>
    <Footer />
  </div>;
}