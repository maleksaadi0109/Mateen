import { fmt } from '@/lib/i18n';
import { tr } from '@/lib/i18n';
import { LocaleSwitch } from '@/components/mateen/LocaleSwitch';
import { type ReactNode } from 'react';
import { useState } from 'react';
import { Link } from 'wouter';
import { getGetCatalogQueryKey, getGetStudyTextQueryKey, useGetCatalog, useGetStudyText } from '@workspace/api-client-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ArrowLeft, BookOpen, BookMarked, Check, Copy, Eye, EyeOff, Link2, Lock, Menu, Search, Share2, Sparkles, X } from 'lucide-react';
import { Logo, ErrorState, SkeletonBlock } from '@/components/mateen/bits';
import { FAQ as ORIGINAL_FAQ, TEACHER_INTENT_KEY, num, usePageMeta } from '@/lib/mateen';
import { cn } from '@/lib/utils';
import { pick } from '@/lib/i18n';
import BookMascot from '@/components/mateen/book-mascot';

// i18n-canonical: bilingual [ar, en] pairs read through pick()
const FAQ_OVERRIDES: Record<string, [string, string]> = {
  available: ['الأربعون النووية في مسار الحديث، وتحفة الأطفال في مسار التجويد والقراءات. نواقض الإسلام والقواعد الأربع ما زالا بوسم «قريباً».', 'al-Arba\'in al-Nawawiyya in the hadith track, and Tuhfat al-Atfal in the tajwid and recitation track. Nawaqid al-Islam and al-Qawa\'id al-Arba\' are still marked "coming soon".'],
  recitation: ['معاينة القراءة في هذه الصفحة ليست تسميعاً صوتياً ولا تقييماً لحفظك. لا ننسب إليك درجة حفظ لم تُختبر، ولا نعرض نتائج غير موثّقة.', 'The reading preview on this page isn\'t voice recitation or an assessment of your memorization. We never credit you with an untested memorization grade, and we show no unverified results.'],
  'teacher-signup': ['أنشئ حساباً واختر «معلم». احفظ ملفك وارفع وثيقة مؤهلاتك الخاصة بصيغة PDF ثم أرسل الطلب للمراجعة. تبقى الوثيقة خاصة ولا تُنشر، ولا يستقبل المعلم إحالات قبل اعتماد المنصة له.', 'Create an account and choose "Teacher". Save your profile, upload your private qualification document as a PDF, then send the application for review. The document stays private and is never published, and teachers receive no referrals before the platform approves them.'],
};
const faqAnswer = (item: (typeof ORIGINAL_FAQ)[number]) => { const o = FAQ_OVERRIDES[item.id]; return o ? pick(o[0], o[1]) : item.a; };

function Reveal({ children, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return <div className={className}>{children}</div>;
}

const NAV = [
  { id: 'about', get label() { return tr("عن المنصة"); }, href: '/about' },
  { id: 'simulator', get label() { return tr("المحاكي التعليمي"); }, href: '#simulator' },
  { id: 'features', get label() { return tr("المزايا"); }, href: '#features' },
  { id: 'tracks', get label() { return tr("المتون"); }, href: '#tracks' },
  { id: 'method', get label() { return tr("منهجيتنا"); }, href: '#method' },
  { id: 'faq', get label() { return tr("الأسئلة الشائعة"); }, href: '#faq' },
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
      <header className="sticky top-[var(--mateen-assistant-height)] z-30 border-b border-border/70 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-2.5 md:px-10">
          <Link href="/" aria-label={tr("مَتِين")}><Logo className="h-11" /></Link>
          <nav className="hidden items-center gap-6 xl:flex" aria-label={tr("التنقل")}>{NAV.map((n) => <NavLink key={n.id} n={n} />)}</nav>
          <div className="flex items-center gap-2">
            <LocaleSwitch compact />
            <Link href="/sign-in" className="hidden rounded-full border border-primary/30 px-4 py-2 font-ui text-sm font-bold text-primary transition hover:bg-primary/5 sm:block" data-testid="link-signin">{tr("دخول")}</Link>
            <Link href="/sign-up" className="hidden rounded-full bg-secondary px-5 py-2 font-ui text-sm font-bold text-secondary-foreground transition hover:-translate-y-0.5 sm:block" data-testid="link-signup-header">{tr("ابدأ كطالب")}</Link>
            <button className="grid min-h-11 min-w-11 place-items-center rounded-full border border-border p-2 xl:hidden" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={tr("القائمة")} data-testid="button-menu">{open ? <X size={19} /> : <Menu size={19} />}</button>
          </div>
        </div>
        {open && <div className="border-t bg-background px-5 py-5 xl:hidden">
          <nav className="flex flex-col gap-4">{NAV.map((n) => <NavLink key={n.id} n={n} onClick={() => setOpen(false)} />)}</nav>
          <div className="mt-5 flex gap-3">
            <Link href="/sign-in" className="flex-1 rounded-full border border-primary/40 py-2.5 text-center font-ui text-sm font-bold text-primary">{tr("دخول")}</Link>
            <Link href="/sign-up" className="flex-1 rounded-full bg-secondary py-2.5 text-center font-ui text-sm font-bold text-secondary-foreground">{tr("ابدأ كطالب")}</Link>
          </div>
        </div>}
      </header>
    </>
  );
}

function Hero() {
  const [tab, setTab] = useState(0);
  const tabs = [pick('الأربعون النووية', "al-Arba'in"), pick('تحفة الأطفال', 'Tuhfat al-Atfal'), pick('القواعد الأربع', "al-Qawa'id")];
  return (
    <section className="relative overflow-hidden bg-[#f4e7d1]">
      <div className="pointer-events-none absolute -top-24 end-[-8rem] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,hsl(var(--secondary)/.14),transparent_65%)]" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 pb-16 pt-12 md:px-10 md:pb-24 md:pt-16 lg:grid-cols-[1.02fr_.98fr] lg:gap-14">
        <div className="max-w-2xl">
          <p className="mateen-rise inline-flex items-center gap-2 rounded-full border border-secondary/25 bg-background/75 px-4 py-2 font-ui text-xs font-bold text-secondary sm:text-sm"><Sparkles size={15} /> {tr("فضاء عربي لطلاب المتون")}</p>
          <h1 className="mateen-rise mt-6 font-display text-[2.6rem] font-extrabold leading-[1.3] text-primary sm:text-6xl lg:text-[4.1rem]" style={{ animationDelay: '80ms' }}>
            {tr("مساعدك الذكي،")}<br />
            <span className="relative inline-block text-secondary">{tr("للحفظ المتين.")}
              <svg className="absolute -bottom-3 start-0 h-4 w-full text-secondary/70" viewBox="0 0 300 16" preserveAspectRatio="none" aria-hidden="true"><path d="M3 10 C 40 2, 70 15, 110 8 S 180 2, 220 9 S 280 13, 297 6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /></svg>
            </span>
          </h1>
          <p className="mateen-rise mt-8 max-w-xl font-arabic text-lg leading-[2] text-foreground/80 md:text-xl" style={{ animationDelay: '160ms' }}>{tr("مساحة هادئة لدراسة المتون العربية: نصٌّ مشكول، إحالة إلى مصدره، وعلامة تعيدك إلى حيث توقفت.")}</p>
          <div className="mateen-rise mt-8 flex flex-wrap gap-3" style={{ animationDelay: '230ms' }}>
            <Link href="/sign-up" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-7 py-3 font-ui font-bold text-primary-foreground shadow-[0_14px_30px_-18px_hsl(var(--primary))] transition hover:-translate-y-0.5" data-testid="link-start-student">{pick('التسجيل كطالب', 'Register as a student')} <ArrowLeft size={17} /></Link>
            <Link href="/sign-up" onClick={() => sessionStorage.setItem(TEACHER_INTENT_KEY, 'teacher')} className="inline-flex min-h-12 items-center rounded-full border-2 border-primary/35 bg-background/40 px-7 py-3 font-ui font-bold text-primary transition hover:bg-background" data-testid="link-start-teacher">{pick('التسجيل كمعلم وموجه', 'Register as a teacher or mentor')}</Link>
          </div>
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-primary/15 pt-5 font-ui text-xs font-semibold text-primary/70">
            <span className="inline-flex items-center gap-2"><BookOpen size={15} className="text-secondary" /> {tr("قراءة ومراجعة ذاتية")}</span>
            <span>{tr("لا ننسب إليك درجة حفظ لم تُختبر")}</span>
          </div>
        </div>
        <div className="relative min-w-0 lg:ps-6">
          <div className="mateen-rise relative mx-auto w-full max-w-[520px] rounded-[1.8rem] border border-primary/12 bg-background p-4 shadow-[0_40px_70px_-45px_hsl(var(--primary)/.7)] sm:p-5" style={{ animationDelay: '120ms' }} aria-label={pick('معاينة شكل التطبيق', 'App preview')}>
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
              <div className="flex gap-1.5" aria-hidden="true"><span className="h-2.5 w-2.5 rounded-full bg-secondary/60" /><span className="h-2.5 w-2.5 rounded-full bg-primary/25" /><span className="h-2.5 w-2.5 rounded-full bg-primary/15" /></div>
              <span className="font-ui text-[11px] font-bold text-muted-foreground">{pick('معاينة توضيحية', 'Illustrative preview')}</span>
            </div>
            <div role="tablist" aria-label={pick('المتون', 'Texts')} className="no-scrollbar mt-3 flex gap-1 overflow-x-auto rounded-full bg-muted/70 p-1">
              {tabs.map((t, k) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('min-h-9 shrink-0 rounded-full px-3.5 font-ui text-xs font-bold transition', tab === k ? 'bg-primary text-primary-foreground' : 'text-foreground/65 hover:text-primary')}>{t}</button>)}
            </div>
            <div className="mt-4 rounded-2xl border border-secondary/20 bg-[#fbf5e9] p-5">
              <div className="flex items-center justify-between font-ui text-[11px] font-bold text-secondary"><span>{tab === 2 ? pick('القواعد الأربع', "al-Qawa'id") : tab === 1 ? pick('باب أحكام النون الساكنة', 'Chapter: rules of sakin nun') : pick('الحديث الأول', 'Hadith 1')}</span><BookMarked size={14} /></div>
              {tab !== 2 && <p lang="ar" dir="rtl" className="hadith-text mt-3 text-[1.35rem] leading-[2.1] text-primary">{tab === 1 ? 'لِلنُّونِ إِنْ تَسْكُنْ وَلِلتَّنْوِينِ ... أَرْبَعُ أَحْكَامٍ فَخُذْ تَبْيِينِي' : 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى'}</p>}
              {tab === 2 && <p className="mt-2 font-ui text-[11px] font-bold text-muted-foreground">{pick('قريبًا — يظهر هنا عند نشره', 'Coming soon — appears here once published')}</p>}
            </div>
            <div className="mt-3 flex items-end gap-3">
              <div className="mateen-bob -mb-2 shrink-0"><BookMascot size={86} title={tr("مَتِين، كتابك الودود")} /></div>
              <div className="relative flex-1 rounded-2xl rounded-es-sm border border-primary/10 bg-muted/60 p-3.5">
                <p className="font-ui text-[11px] font-bold text-secondary">{pick('ملاحظة المساعد', 'Assistant note')}</p>
                <p className="mt-1 font-arabic text-sm leading-7 text-foreground/80">{pick('أشرح المفردة وأحيلك إلى مصدرها؛ وما يتجاوز ذلك أرفعه إلى شيخ بموافقتك.', 'I explain the wording and point you to its source; anything beyond that goes to a shaykh, with your consent.')}</p>
              </div>
            </div>
          </div>
          <span className="pointer-events-none absolute -bottom-6 start-8 hidden font-arabic text-sm text-primary/45 lg:block" lang="ar">بِالعلمِ تُبنى الخُطى</span>
        </div>
      </div>
      <div className="h-2 bg-secondary/80" />
    </section>
  );
}

const bookCover = (file: 'nawawi-mateen.png' | 'tuhfa-mateen.png') => `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}images/book-covers/${file}`;

function BookShelf() {
  const q = useGetCatalog({ query: { enabled: true, queryKey: getGetCatalogQueryKey() } });
  const available = (id: string) => q.data?.some((text) => text.id === id && text.status === 'available') ?? false;
  const availabilityLabel = (id: string) => available(id) ? tr("متاح للقراءة") : q.data?.some((text) => text.id === id && text.status === 'coming_soon') ? tr("قريبًا") : tr("غير متاح حاليًا");
  return (
    <section aria-labelledby="shelf-title" className="relative overflow-hidden bg-background py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <Reveal><div className="flex flex-col gap-4 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="font-ui text-xs font-bold uppercase tracking-[.16em] text-secondary">{tr("على رفّ مَتِين")}</p><h2 id="shelf-title" className="mt-2 font-display text-3xl font-bold text-primary md:text-4xl">{tr("متونٌ نقرؤها بعناية")}</h2></div>
          <p className="max-w-md font-arabic text-base leading-loose text-muted-foreground">{tr("نبدأ بما هو متاح في المنصة اليوم؛ وما لم يكتمل بعد، نترك له مكانًا دون أن ندّعي جاهزيته.")}</p>
        </div></Reveal>
        {q.isLoading ? <div className="mt-8 grid gap-5 md:grid-cols-2"><SkeletonBlock className="h-80" /><SkeletonBlock className="h-80" /></div> : q.isError ? <div className="mt-8"><ErrorState message={tr("تعذّر تحميل حالة الكتب.")} onRetry={() => q.refetch()} /></div> : <div className="mt-8 grid gap-5 md:grid-cols-2">
          <Reveal><article className="group flex min-w-0 items-center gap-5 rounded-[1.65rem] border border-border bg-[#fbf5e9] p-4 sm:gap-7 sm:p-6">
            <div className="w-[34%] max-w-[176px] shrink-0 overflow-hidden rounded-xl bg-[#e7d7bd] shadow-[0_15px_28px_-18px_hsl(var(--primary)/.7)]">
              <img src={bookCover('nawawi-mateen.png')} width={802} height={1280} loading="lazy" decoding="async" alt={tr("غلاف الأربعين النووية")} className="block h-auto w-full object-contain transition-transform duration-500 group-hover:scale-[1.025]" />
            </div>
            <div className="min-w-0 py-2">
              <span className="font-ui text-xs font-bold text-secondary">{availabilityLabel('nawawi')}</span>
              <h3 className="mt-2 font-display text-xl font-bold leading-relaxed text-primary sm:text-2xl">{tr("الأربعون النووية")}</h3>
              <p className="mt-2 font-arabic leading-[1.9] text-foreground/70">{tr("مدخل إلى أحاديث جامعة، مع متابعة موضع القراءة وعلامات المراجعة.")}</p>
              <>{available('nawawi') && <Link href="/sign-up" className="mt-4 inline-flex items-center gap-2 font-ui text-sm font-bold text-secondary underline decoration-secondary/40 underline-offset-4">{tr("ابدأ القراءة")}{' '}<ArrowLeft size={15} /></Link>}</>
            </div>
          </article></Reveal>
          <Reveal delay={0.08}><article className="group flex min-w-0 items-center gap-5 rounded-[1.65rem] border border-border bg-[#f0e7d7] p-4 sm:gap-7 sm:p-6">
            <div className="w-[34%] max-w-[176px] shrink-0 overflow-hidden rounded-xl bg-[#e2d4bc] shadow-[0_15px_28px_-18px_hsl(var(--primary)/.7)]">
              <img src={bookCover('tuhfa-mateen.png')} width={802} height={1280} loading="lazy" decoding="async" alt={tr("غلاف تحفة الأطفال")} className="block h-auto w-full object-contain transition-transform duration-500 group-hover:scale-[1.025]" />
            </div>
            <div className="min-w-0 py-2">
              <span className="font-ui text-xs font-bold text-secondary">{availabilityLabel('tuhfa')}</span>
              <h3 className="mt-2 font-display text-xl font-bold leading-relaxed text-primary sm:text-2xl">{tr("تحفة الأطفال")}</h3>
              <p className="mt-2 font-arabic leading-[1.9] text-foreground/70">{tr("منظومة في التجويد للإمام سليمان الجمزوري؛ نقرأ أبوابها خطوةً خطوة.")}</p>
              <>{available('tuhfa') && <Link href="/sign-up" className="mt-4 inline-flex items-center gap-2 font-ui text-sm font-bold text-secondary underline decoration-secondary/40 underline-offset-4">{tr("تعرّف إلى المسار")}{' '}<ArrowLeft size={15} /></Link>}</>
            </div>
          </article></Reveal>
        </div>}
      </div>
    </section>
  );
}

function safeSourceUrl(raw: string | undefined) {
  if (!raw) return undefined;
  try { const url = new URL(raw); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}

function Simulator() {
  const q = useGetStudyText('nawawi', { query: { enabled: true, queryKey: getGetStudyTextQueryKey('nawawi'), retry: 1 } });
  const [i, setI] = useState(0);
  const [hide, setHide] = useState(false);
  const [shown, setShown] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const hs = q.data?.hadiths ?? [];
  const h = hs[Math.min(i, Math.max(hs.length - 1, 0))];
  const sourceHref = safeSourceUrl(h?.sourceUrl);
  const pick = (n: number) => { setI(n); setShown(new Set()); };
  const words = h ? h.text.split(/\s+/).filter(Boolean) : [];
  const payload = h ? fmt("{a}\n\nالمصدر: {b}، صفحة {c}\n{d}", "{a}\n\nSource: {b}, page {c}\n{d}", { a: h.text, b: q.data?.title, c: h.sourcePage, d: h.sourceUrl }) : '';
  const copy = async () => { try { await navigator.clipboard.writeText(payload); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* clipboard unavailable */ } };
  const share = async () => { if (navigator.share) { try { await navigator.share({ title: tr("حديث من الأربعين النووية"), text: payload }); } catch { /* cancelled */ } } else await copy(); };
  return (
    <section id="simulator" className="scroll-mt-28 bg-primary py-16 text-primary-foreground md:py-24">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <Reveal><div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div><p className="font-ui text-xs font-bold tracking-[.14em] text-[#f2c98c]">{tr("تجربة القراءة")}</p><h2 className="mt-3 max-w-3xl font-display text-3xl font-bold leading-[1.45] md:text-5xl">{tr("تأنَّ في النص، وارجع إلى موضعك")}</h2></div>
          <p className="max-w-sm border-s border-white/30 ps-4 font-arabic text-base leading-loose text-primary-foreground/80">{tr("معاينة تعليمية للقراءة وتغطية الكلمات فقط؛ ليست تسميعًا صوتيًا ولا تقييمًا للحفظ.")}</p>
        </div></Reveal>
        <div className="mt-9 grid gap-5 lg:grid-cols-[230px_1fr]">
          <div className="max-h-[22rem] overflow-y-auto rounded-2xl border border-white/15 bg-white/5 p-3" role="tablist" aria-label={tr("الأحاديث")}>
            {q.isLoading ? <div className="space-y-2">{[0, 1, 2, 3].map((k) => <div key={k} className="h-10 animate-pulse rounded-lg bg-white/15" />)}</div>
              : hs.slice(0, 12).map((x, k) => <button key={x.id} data-testid={`button-sim-${x.number}`} role="tab" aria-selected={k === i} onClick={() => pick(k)} className={cn('mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start font-ui text-sm transition', k === i ? 'bg-background text-primary' : 'text-primary-foreground hover:bg-white/10')}>
                <span className="font-bold">{num(x.number)}</span><span className="truncate">{x.title}</span>
              </button>)}
            {!q.isLoading && !q.isError && hs.length === 0 && <p className="p-3 font-arabic text-sm leading-loose text-primary-foreground/80">{tr("لا توجد عينة نصية متاحة الآن.")}</p>}
          </div>
          <div className="min-h-64 rounded-[1.6rem] bg-background p-5 text-foreground sm:p-8 md:p-10">
            {q.isError ? <ErrorState message={tr("تعذّر جلب النص من مصدره الآن. لا نعرض اقتباسًا بديلًا.")} onRetry={() => q.refetch()} />
              : q.isLoading ? <div className="space-y-4"><SkeletonBlock className="h-7" /><SkeletonBlock className="h-28" /></div>
              : h ? <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-display text-xl font-bold text-primary">{tr("الحديث")}{' '}{num(h.number)}: {h.title}</h3>
                  <button onClick={() => { setHide(!hide); setShown(new Set()); }} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/30 px-4 py-2 font-ui text-xs font-bold text-primary" aria-pressed={hide} data-testid="button-hide-words">{hide ? <Eye size={14} /> : <EyeOff size={14} />}{hide ? tr("إظهار الكل") : tr("غطِّ الكلمات")}</button>
                </div>
                <p data-testid="text-sim-hadith" className="hadith-text mt-6 text-xl leading-[2.2] sm:text-2xl">{words.map((w, k) => hide && !shown.has(k)
                  ? <button key={k} onClick={() => setShown(new Set(shown).add(k))} className="mx-1 inline-block min-w-10 rounded-md bg-primary/20 px-1 align-middle text-transparent" aria-label={tr("كلمة مغطاة، اضغط لإظهارها")}>{w}</button>
                  : <span key={k}> {w}</span>)}</p>
                <div className="mt-6 flex flex-wrap items-center gap-3 border-t pt-5 font-ui text-sm">
                  <a href={sourceHref} aria-disabled={!sourceHref} title={sourceHref ? undefined : tr("رابط المصدر غير متاح أو غير صالح")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-muted-foreground underline underline-offset-4 hover:text-secondary"><Link2 size={14} />{q.data?.title}{tr("، صفحة")}{' '}{num(h.sourcePage)}</a><span className="flex-1" />
                  <button data-testid="button-copy" onClick={copy} className="inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 font-bold hover:bg-muted">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? tr("تم النسخ") : tr("نسخ")}</button>
                  <button data-testid="button-share" onClick={share} className="inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 font-bold hover:bg-muted"><Share2 size={14} />{tr("مشاركة")}</button>
                </div>
                {q.data?.sourceStatus === 'retrieved_pending_review' && <p className="mt-4 rounded-xl border border-secondary/40 bg-secondary/10 p-3 font-ui text-xs leading-relaxed">{tr("النص منقول من مصدره وقيد المراجعة العلمية، فلا يُعتمد مرجعًا.")}</p>}
              </> : <p className="font-arabic text-lg leading-loose text-muted-foreground">{tr("لا نص متاحًا حاليًا من المصدر. لا نعرض عيّنات من خارجه.")}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  { n: '01', get title() { return tr("النص مع إحالة واضحة"); }, get copy() { return tr("تعرّف إلى الكتاب والصفحة والرابط، ثم راجع المصدر بنفسك."); } },
  { n: '02', get title() { return tr("علامتك تبقى لك"); }, get copy() { return tr("احفظ موضع التوقف واجمع ما تريد العودة إليه في مراجعاتك."); } },
  { n: '03', get title() { return tr("بحث وقراءة مريحة"); }, get copy() { return tr("ابحث في النص، واختر حجم الخط الأنسب لجلسة القراءة."); } },
  { n: '04', get title() { return tr("متابعة بلا ادعاء"); }, get copy() { return tr("تعلّم بنفسك ما درست؛ لا ننسب إليك درجة حفظ لم تُختبر."); } },
];

function Features() {
  return <section id="features" className="scroll-mt-28 bg-[#f0e7d7] py-16 md:py-24">
    <div className="mx-auto max-w-7xl px-5 md:px-10">
      <Reveal><div className="grid gap-5 md:grid-cols-[.8fr_1.2fr] md:items-end">
        <div><p className="font-ui text-xs font-bold tracking-[.14em] text-secondary">{tr("تجربة دراسة بسيطة")}</p><h2 className="mt-3 font-display text-3xl font-bold leading-relaxed text-primary md:text-4xl">{tr("ما يعينك على")}<br className="hidden md:block" />{' '}{tr("مواصلة القراءة")}</h2></div>
        <p className="max-w-xl font-arabic text-lg leading-[2] text-foreground/75">{tr("أدوات صغيرة تساعد على التنظيم، وتترك الفهم والتحصيل في موضعهما الصحيح: بين الطالب ومعلمه.")}</p>
      </div></Reveal>
      <div className="mt-10 grid gap-0 border-y border-primary/15 md:grid-cols-4 md:divide-x md:divide-x-reverse md:divide-primary/15">
        {FEATURES.map((f, i) => <Reveal key={f.n} delay={i * .05}><article className="min-h-[190px] border-b border-primary/15 py-6 md:border-b-0 md:px-5 md:py-7 first:md:ps-0 last:md:pe-0">
          <span className="font-ui text-xs font-bold tracking-[.15em] text-secondary">{f.n}</span><h3 className="mt-4 font-display text-xl font-bold text-primary">{f.title}</h3><p className="mt-3 font-arabic leading-[1.9] text-muted-foreground">{f.copy}</p>
        </article></Reveal>)}
      </div>
      <p className="mt-6 border-s-2 border-secondary/50 ps-4 font-arabic text-sm leading-loose text-muted-foreground">{tr("المحاكي في هذه الصفحة للقراءة وتغطية الكلمات فقط؛ لا يقيّم الحفظ أو أحكام التجويد، ولا تُعامل متابعة القراءة كدرجة إتقان.")}</p>
    </div>
  </section>;
}

function Tracks() {
  const q = useGetCatalog({ query: { enabled: true, queryKey: getGetCatalogQueryKey() } });
  return <section id="tracks" className="scroll-mt-28 py-16 md:py-24">
    <div className="mx-auto max-w-7xl px-5 md:px-10">
      <Reveal><div className="flex items-end justify-between gap-5 border-b border-border pb-6"><div><p className="font-ui text-xs font-bold tracking-[.14em] text-secondary">{tr("المسارات")}</p><h2 className="mt-3 font-display text-3xl font-bold text-primary md:text-4xl">{tr("من أين تبدأ؟")}</h2></div><p className="hidden max-w-sm font-arabic leading-loose text-muted-foreground sm:block">{tr("المتاح الآن ظاهر كما هو؛ والمسارات الأخرى تنتظر إعدادها.")}</p></div></Reveal>
      <div className="mt-6 divide-y divide-border">
        {q.isLoading ? [0, 1, 2].map((k) => <SkeletonBlock key={k} className="my-3 h-24" />) : q.isError ? <ErrorState message={tr("تعذّر تحميل المسارات.")} onRetry={() => q.refetch()} />
          : q.data?.map((t, k) => {
            const available = t.status === 'available';
            return <Reveal key={t.id} delay={k * .04}><article className="grid min-w-0 gap-3 py-5 sm:grid-cols-[1fr_auto] sm:items-center" data-testid={`card-landing-track-${t.id}`}>
              <div className="flex min-w-0 items-center gap-4">
                <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-2xl', available ? 'bg-secondary/10 text-secondary' : 'bg-muted text-muted-foreground')}>{available ? <BookMarked size={21} /> : <Lock size={19} />}</span>
                <div className="min-w-0"><p className="font-ui text-xs font-semibold text-secondary">{tr(t.track)} · {tr(t.level)}</p><h3 className="mt-1 font-display text-xl font-bold text-primary">{tr(t.title)}</h3><p className="mt-1 font-arabic leading-relaxed text-muted-foreground">{tr(t.description)}</p></div>
              </div>
              <div className="flex items-center gap-3 ps-16 sm:ps-0"><span className={cn('rounded-full px-3 py-1 font-ui text-xs font-bold', available ? 'bg-secondary/10 text-secondary' : 'border border-dashed border-muted-foreground/40 text-muted-foreground')}>{available ? tr("متاح") : tr("قريبًا")}</span>{available && <Link href="/sign-up" className="font-ui text-sm font-bold text-secondary underline underline-offset-4">{tr("ابدأ")}</Link>}</div>
            </article></Reveal>;
          })}
      </div>
    </div>
  </section>;
}

const STEPS = [
  { get title() { return tr("اقرأ النص"); }, get copy() { return tr("نص مشكول منسوب إلى مصدره وصفحته."); } },
  { get title() { return tr("ضع علامتك"); }, get copy() { return tr("علّم ما يحتاج عودة، وتابع موضع وقوفك."); } },
  { get title() { return tr("ارجع وراجع"); }, get copy() { return tr("اجمع علاماتك في مساحة للمراجعة."); } },
  { get title() { return tr("استعن بمعلمك"); }, get copy() { return tr("التقنية أداة مساعدة، وليست بديلًا عن الشيخ والمعلم."); } },
];

function Method() {
  return <section id="method" className="scroll-mt-28 border-y border-border bg-[#fbf5e9] py-16 md:py-24">
    <div className="mx-auto grid max-w-7xl gap-9 px-5 md:px-10 lg:grid-cols-[.8fr_1.2fr]">
      <Reveal><div className="lg:sticky lg:top-36"><p className="font-ui text-xs font-bold tracking-[.14em] text-secondary">{tr("على بيّنة")}</p><h2 className="mt-3 font-display text-3xl font-bold leading-relaxed text-primary md:text-4xl">{tr("قراءة أمينة،")}<br />{tr("ومصدرٌ معروف")}</h2><p className="mt-5 max-w-md font-arabic text-lg leading-[2] text-foreground/75">{tr("لا إفتاء ولا اجتهاد آلي. ما لا يتصل بالمصادر يحال إلى أهل العلم؛ والمحتوى قيد المراجعة لا يغني عن الرجوع إلى أصله ومعلمك.")}</p></div></Reveal>
      <ol className="divide-y divide-border border-y border-border">
        {STEPS.map((s, i) => <Reveal key={s.title} delay={i * .05}><li className="flex gap-5 py-5 sm:gap-7"><span className="font-ui text-sm font-bold text-secondary">{tr("۰")}{i + 1}</span><div><h3 className="font-display text-xl font-bold text-primary">{s.title}</h3><p className="mt-1 font-arabic leading-loose text-muted-foreground">{s.copy}</p></div></li></Reveal>)}
      </ol>
    </div>
  </section>;
}

function Faq() {
  return <section id="faq" className="scroll-mt-28 py-16 md:py-24"><div className="mx-auto max-w-3xl px-5 md:px-10">
    <Reveal><p className="text-center font-ui text-xs font-bold tracking-[.14em] text-secondary">{tr("لديك سؤال؟")}</p><h2 className="mt-3 text-center font-display text-3xl font-bold text-primary md:text-4xl">{tr("إجابات واضحة")}</h2></Reveal>
    <Accordion type="single" collapsible className="mt-8">{ORIGINAL_FAQ.map((f, i) => <AccordionItem key={f.id} value={`q${i}`}><AccordionTrigger className="text-start font-display text-lg font-bold">{f.q}</AccordionTrigger><AccordionContent className="font-arabic text-lg leading-loose text-muted-foreground">{faqAnswer(f)}</AccordionContent></AccordionItem>)}</Accordion>
  </div></section>;
}

function Closing() {
  return <section className="bg-[#ead9bc] py-14 md:py-20"><div className="mx-auto flex max-w-7xl flex-col items-center gap-7 px-5 text-center sm:flex-row sm:text-start md:px-10">
    <BookMascot size={106} mood="cheer" pose="happy" title={tr("مَتِين يدعوك للقراءة")} /><div className="flex-1"><p className="font-ui text-xs font-bold tracking-[.14em] text-secondary">{tr("على مهلٍ، وبخطوةٍ واضحة")}</p><h2 className="mt-2 font-display text-3xl font-bold text-primary md:text-4xl">{tr("ابدأ من المتن المتاح")}</h2><p className="mt-3 font-arabic leading-loose text-foreground/75">{tr("نقرأ ما اكتمل، ونصرّح بما لا يزال قيد الإعداد.")}</p></div>
    <div className="flex flex-wrap justify-center gap-3"><Link href="/sign-up" className="inline-flex min-h-12 items-center rounded-full bg-secondary px-7 py-3 font-ui font-bold text-secondary-foreground transition hover:-translate-y-0.5" data-testid="link-cta-student">{tr("ابدأ كطالب")}</Link><Link href="/about" className="inline-flex min-h-12 items-center rounded-full border border-primary/35 px-7 py-3 font-ui font-bold text-primary" data-testid="link-cta-about">{tr("عن مَتِين")}</Link></div>
  </div></section>;
}

function Footer() {
  return <footer className="border-t border-border bg-background py-8"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-5 md:flex-row md:px-10">
    <Logo className="h-10" /><p className="max-w-lg text-center font-arabic text-sm leading-loose text-muted-foreground">{tr("المحتوى المعروض قيد المراجعة العلمية؛ راجع مصادره ولا تجعله بديلًا عن أهل العلم.")}</p><div className="flex gap-5 font-ui text-sm font-semibold"><Link href="/about">{tr("عن المنصة")}</Link><Link href="/sign-in">{tr("دخول")}</Link><a href="#faq" aria-label={tr("الأسئلة")}><Search size={15} className="inline" />{' '}{tr("الأسئلة")}</a></div>
  </div></footer>;
}

export function MateenLanding() {
  usePageMeta(tr("مَتِين | فضاء عربي لدراسة المتون العلمية"), tr("اقرأ المتون المتاحة مع إحالاتها، وتابع موضع توقفك وعلاماتك في منصة مَتِين."));
  return <div data-testid="mateen-landing" className="min-h-[100dvh] min-w-0 overflow-x-clip bg-background">
    <Header />
    <main><Hero /><BookShelf /><Features /><Simulator /><Tracks /><Method /><Faq /><Closing /></main>
    <Footer />
  </div>;
}