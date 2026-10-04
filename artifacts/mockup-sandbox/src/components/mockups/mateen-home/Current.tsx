import './_group.css';
import { useState } from 'react';
import { Link } from './_data';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { getGetCatalogQueryKey, getGetStudyTextQueryKey, useGetCatalog, useGetStudyText } from './_data';
import { ArrowLeft, BookMarked, Check, Copy, Eye, EyeOff, Link2, Lock, MessageCircleQuestion, Menu, Search, Share2, X } from 'lucide-react';
import { Logo, Ornament, Reveal, StarMark, ErrorState, SkeletonBlock } from './_bits';
import { FAQ, TEACHER_INTENT_KEY, num, usePageMeta } from './_lib';
import { cn } from '@/lib/utils';

const NAV = [
  { id: 'about', label: 'عن المنصة', href: '/about' },
  { id: 'simulator', label: 'المحاكي التعليمي', href: '#simulator' },
  { id: 'features', label: 'المزايا', href: '#features' },
  { id: 'tracks', label: 'المسارات', href: '#tracks' },
  { id: 'method', label: 'المنهجية', href: '#method' },
  { id: 'faq', label: 'الأسئلة الشائعة', href: '#faq' },
];

function NavLink({ n, onClick }: { n: (typeof NAV)[number]; onClick?: () => void }) {
  const cls = 'font-ui text-sm font-semibold text-foreground/75 transition hover:text-secondary';
  return n.href.startsWith('#') ? <a href={n.href} onClick={onClick} className={cls}>{n.label}</a> : <Link href={n.href} className={cls} onClick={onClick}>{n.label}</Link>;
}

function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-[var(--mateen-assistant-height)] z-30 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-3 md:px-10">
        <Link href="/" aria-label="مَتِين"><Logo className="h-12" /></Link>
        <nav className="hidden items-center gap-7 lg:flex" aria-label="التنقل">{NAV.map((n) => <NavLink key={n.id} n={n} />)}</nav>
        <div className="flex items-center gap-2">
          <Link href="/sign-in" className="hidden rounded-full border border-primary/40 px-5 py-2 font-ui text-sm font-bold text-primary transition hover:bg-primary hover:text-primary-foreground sm:block" data-testid="link-signin">دخول</Link>
          <Link href="/sign-up" className="hidden rounded-full bg-secondary px-5 py-2 font-ui text-sm font-bold text-secondary-foreground transition hover:-translate-y-0.5 sm:block" data-testid="link-signup-header">ابدأ كطالب</Link>
          <button className="rounded-full border p-2 lg:hidden" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="القائمة" data-testid="button-menu">{open ? <X size={20} /> : <Menu size={20} />}</button>
        </div>
      </div>
      {open && (
        <div className="border-t bg-background px-5 py-5 lg:hidden">
          <nav className="flex flex-col gap-4">{NAV.map((n) => <NavLink key={n.id} n={n} onClick={() => setOpen(false)} />)}</nav>
          <div className="mt-5 flex gap-3">
            <Link href="/sign-in" className="flex-1 rounded-full border border-primary/40 py-2.5 text-center font-ui text-sm font-bold text-primary">دخول</Link>
            <Link href="/sign-up" className="flex-1 rounded-full bg-secondary py-2.5 text-center font-ui text-sm font-bold text-secondary-foreground">ابدأ كطالب</Link>
          </div>
        </div>
      )}
    </header>
  );
}

function useNawawi() {
  return useGetStudyText('nawawi', { query: { enabled: true, queryKey: getGetStudyTextQueryKey('nawawi'), retry: 1 } });
}

function Hero() {
  const q = useNawawi();
  const h = q.data?.hadiths?.[0];
  return (
    <section className="star-pattern relative overflow-hidden">
      <StarMark size={760} className="spin-slow pointer-events-none absolute -left-64 -top-40 text-secondary/10" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 py-16 md:px-10 md:py-24 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <Reveal><p className="inline-flex items-center gap-2 rounded-full border border-secondary/40 bg-card px-4 py-1.5 font-ui text-sm font-bold text-secondary"><StarMark size={16} /> فضاء عربي لطلاب المتون</p></Reveal>
          <Reveal delay={0.08}><h1 className="mt-6 font-display text-5xl font-extrabold leading-[1.3] text-primary md:text-7xl">المتنُ بين يديك،<br /><span className="text-secondary">ومصدرُه أمام عينيك</span></h1></Reveal>
          <Reveal delay={0.16}><p className="mt-7 max-w-xl font-arabic text-xl leading-[2.1] text-foreground/80">اقرأ «الأربعين النووية» بتشكيلها، وضع علامتك حيث وقفت، وارجع إلى ما وسمته بعد أيام. كل نص ينسب إلى مصدره وصفحته، وما لم يجهز بعد نقول لك إنه لم يجهز.</p></Reveal>
          <Reveal delay={0.24}>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/sign-up" className="inline-flex items-center gap-2 rounded-full bg-secondary px-8 py-3.5 font-ui font-bold text-secondary-foreground shadow-[0_14px_30px_-14px_hsl(var(--secondary))] transition hover:-translate-y-1" data-testid="link-start-student">ابدأ كطالب <ArrowLeft size={18} /></Link>
              <Link href="/sign-up" onClick={() => sessionStorage.setItem(TEACHER_INTENT_KEY, 'teacher')} className="rounded-full border-2 border-primary/50 px-8 py-3.5 font-ui font-bold text-primary transition hover:bg-primary hover:text-primary-foreground" data-testid="link-start-teacher">سجّل كمعلم</Link>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.2}>
          <div className="floaty relative mx-auto max-w-md">
            <div className="absolute -inset-4 rounded-[2rem] border border-secondary/30" aria-hidden="true" />
            <div className="paper-card relative rounded-[1.6rem] p-8 md:p-10">
              <div className="mb-5 flex items-center justify-between font-ui text-xs font-bold">
                <span className="rounded-full bg-secondary/15 px-3 py-1 text-secondary">معاينة تعليمية</span>
                <span className="text-muted-foreground">الأربعون النووية</span>
              </div>
              {q.isLoading ? <div className="space-y-3"><SkeletonBlock className="h-6" /><SkeletonBlock className="h-6" /><SkeletonBlock className="h-6" /></div>
                : h ? <><p className="font-display text-sm font-bold text-secondary">الحديث {num(h.number)}</p><p className="hadith-text mt-3 text-[1.35rem]" data-testid="text-hero-hadith">{h.text}</p><p className="mt-5 font-ui text-xs text-muted-foreground">{q.data?.title}، ص {num(h.sourcePage)}</p></>
                : <p className="font-arabic text-lg leading-loose text-muted-foreground">تعذّر جلب النص من مصدره الآن. لا نعرض بديلاً غير موثّق.</p>}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Simulator() {
  const q = useNawawi();
  const [i, setI] = useState(0);
  const [hide, setHide] = useState(false);
  const [shown, setShown] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const hs = q.data?.hadiths ?? [];
  const h = hs[Math.min(i, Math.max(hs.length - 1, 0))];
  const pick = (n: number) => { setI(n); setShown(new Set()); };
  const words = h ? h.text.split(/\s+/).filter(Boolean) : [];
  const payload = h ? `${h.text}\n\nالمصدر: ${q.data?.title}، صفحة ${h.sourcePage}\n${h.sourceUrl}` : '';
  const copy = async () => { try { await navigator.clipboard.writeText(payload); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard unavailable */ } };
  const share = async () => { if (navigator.share) { try { await navigator.share({ title: 'حديث من الأربعين النووية', text: payload }); } catch { /* cancelled */ } } else copy(); };

  return (
    <section id="simulator" className="scroll-mt-20 bg-primary py-20 text-primary-foreground md:py-28">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <Reveal>
          <p className="font-ui text-sm font-bold text-[#f3c58a]">المحاكي التعليمي</p>
          <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold leading-[1.4] md:text-5xl">جرّب القراءة وتغطية الكلمات، على نص من المنصة نفسها</h2>
          <p className="mt-4 max-w-2xl rounded-xl border border-white/20 bg-white/10 p-4 font-ui text-sm leading-relaxed">معاينة تعليمية بالقراءة والتغطية فقط، ليست تسميعاً صوتياً ولا ذكاءً اصطناعياً ولا تقييماً لحفظك. عيّناتها من «الأربعين النووية» وحدها.</p>
        </Reveal>
        <div className="mt-10 grid gap-6 lg:grid-cols-[260px_1fr]">
          <div className="max-h-[22rem] overflow-y-auto rounded-2xl bg-white/10 p-3" role="tablist" aria-label="الأحاديث">
            {q.isLoading ? <div className="space-y-2">{[0, 1, 2, 3].map((k) => <div key={k} className="h-10 animate-pulse rounded-lg bg-white/15" />)}</div>
              : hs.slice(0, 12).map((x, k) => (
                <button key={x.id} role="tab" aria-selected={k === i} onClick={() => pick(k)} className={cn('mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right font-ui text-sm transition', k === i ? 'bg-background text-primary' : 'hover:bg-white/10')} data-testid={`button-sim-${x.number}`}>
                  <span className="font-bold">{num(x.number)}</span><span className="truncate">{x.title}</span>
                </button>))}
          </div>
          <div className="rounded-3xl bg-background p-7 text-foreground md:p-10">
            {q.isError ? <ErrorState message="تعذّر جلب النص من الخادم." onRetry={() => q.refetch()} />
              : !q.isLoading && !h ? <p className="font-arabic text-lg text-muted-foreground">لا نص متاحاً حالياً من المصدر. لا نعرض عيّنات من خارج المنصة.</p>
              : h && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-display text-xl font-bold text-primary">الحديث {num(h.number)}: {h.title}</h3>
                    <div className="flex gap-2">
                      <button onClick={() => { setHide(!hide); setShown(new Set()); }} className="inline-flex items-center gap-2 rounded-full border border-primary/40 px-4 py-2 font-ui text-xs font-bold text-primary" aria-pressed={hide} data-testid="button-hide-words">{hide ? <Eye size={14} /> : <EyeOff size={14} />}{hide ? 'إظهار الكل' : 'غطِّ الكلمات'}</button>
                    </div>
                  </div>
                  <p className="hadith-text mt-6 text-2xl" data-testid="text-sim-hadith">
                    {words.map((w, k) => hide && !shown.has(k)
                      ? <button key={k} onClick={() => setShown(new Set(shown).add(k))} className="mx-1 inline-block min-w-10 rounded-md bg-primary/20 px-1 align-middle text-transparent transition hover:bg-primary/30" aria-label="كلمة مغطاة، اضغط لإظهارها">{w}</button>
                      : <span key={k}> {w}</span>)}
                  </p>
                  <div className="mt-6 flex flex-wrap items-center gap-3 border-t pt-5 font-ui text-sm">
                    <a href={h.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-muted-foreground underline underline-offset-4 hover:text-secondary"><Link2 size={14} />{q.data?.title}، صفحة {num(h.sourcePage)}</a>
                    <span className="flex-1" />
                    <button onClick={copy} className="inline-flex items-center gap-2 rounded-full border px-4 py-2 font-bold hover:bg-muted" data-testid="button-copy">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'تم النسخ' : 'نسخ'}</button>
                    <button onClick={share} className="inline-flex items-center gap-2 rounded-full border px-4 py-2 font-bold hover:bg-muted" data-testid="button-share"><Share2 size={14} />مشاركة</button>
                  </div>
                  {q.data?.sourceStatus === 'retrieved_pending_review' && <p className="mt-4 rounded-xl border border-secondary/40 bg-secondary/10 p-3 font-ui text-xs leading-relaxed">النص منقول من مصدره وقيد المراجعة العلمية، فلا يُعتمد مرجعاً.</p>}
                </>
              )}
          </div>
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  { t: 'نص بتشكيله ومصدره', d: 'كل حديث يُعرض مع اسم الكتاب ورقم الصفحة ورابط الأصل، لتراجع ما تقرؤه بنفسك.', big: true },
  { t: 'موضع التوقف يُحفظ', d: 'أغلق الصفحة وارجع غداً؛ تفتح على الحديث الذي وقفت عنده.' },
  { t: 'علامات وقائمة مراجعة', d: 'ضع علامة على ما يحتاج عودة، وستجدها مجموعة في صفحة المراجعات.' },
  { t: 'وسم الدراسة إقرارٌ منك', d: 'تعلّم بنفسك ما درست؛ لا ننسب إليك درجة حفظ لم تُختبر.', big: true },
  { t: 'بحث وحجم خط', d: 'ابحث في النص بلا اعتبار للتشكيل، وكبّر الخط على راحتك.' },
];

function Features() {
  return (
    <section id="features" className="scroll-mt-20 py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <Reveal><Ornament /><h2 className="mt-6 text-center font-display text-4xl font-bold text-primary md:text-5xl">ما تجده اليوم داخل المنصة</h2></Reveal>
        <div className="mt-14 grid gap-5 md:grid-cols-6">
          {FEATURES.map((f, i) => (
            <Reveal key={f.t} delay={i * 0.06} className={cn(f.big ? 'md:col-span-3' : 'md:col-span-2', i === 4 && 'md:col-span-6')}>
              <div className="paper-card relative h-full overflow-hidden p-8 transition hover:-translate-y-1">
                <StarMark size={90} className="absolute -left-6 -top-6 text-secondary/15" />
                <p className="font-display text-sm font-bold text-secondary">{num(i + 1)}</p>
                <h3 className="mt-3 font-display text-2xl font-bold">{f.t}</h3>
                <p className="mt-3 font-arabic text-lg leading-loose text-muted-foreground">{f.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.1}>
          <div className="mt-8 rounded-2xl border border-dashed border-secondary/50 p-6 text-center font-arabic text-lg leading-loose text-foreground/80">
            قيد الإعداد وغير متاح بعد: التسميع الصوتي، المساعد العلمي المقيّد بالمصادر، والاختبارات. نعلن عن كل منها حين يُتحقق منه فعلاً.
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Tracks() {
  const q = useGetCatalog({ query: { enabled: true, queryKey: getGetCatalogQueryKey() } });
  return (
    <section id="tracks" className="scroll-mt-20 star-pattern border-y bg-card/50 py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <Reveal><p className="font-ui text-sm font-bold text-secondary">المسارات</p><h2 className="mt-3 font-display text-4xl font-bold text-primary md:text-5xl">متنٌ واحد مفتوح، والبقية في الطريق</h2></Reveal>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {q.isLoading ? [0, 1, 2, 3].map((k) => <SkeletonBlock key={k} className="h-56" />) : q.isError ? <div className="md:col-span-4"><ErrorState message="تعذّر تحميل المسارات." onRetry={() => q.refetch()} /></div>
            : q.data?.map((t, k) => {
              const open = t.status === 'available';
              return (
                <Reveal key={t.id} delay={k * 0.07}>
                  <div className={cn('paper-card flex h-full flex-col p-7', open ? 'border-secondary/60 bg-background' : 'opacity-75')} data-testid={`card-landing-track-${t.id}`}>
                    <div className="flex justify-between">{open ? <BookMarked className="text-secondary" /> : <Lock className="text-muted-foreground" />}
                      <span className={cn('rounded-full px-3 py-1 font-ui text-xs font-bold', open ? 'bg-secondary text-secondary-foreground' : 'border border-dashed border-muted-foreground/60 text-muted-foreground')}>{open ? 'متاح' : 'قريباً'}</span></div>
                    <p className="mt-5 font-ui text-xs font-semibold text-secondary">{t.track} · {t.level}</p>
                    <h3 className="mt-1 font-display text-2xl font-bold">{t.title}</h3>
                    <p className="mt-3 flex-1 font-arabic leading-loose text-muted-foreground">{t.description}</p>
                    {open && <Link href="/sign-up" className="mt-5 font-ui text-sm font-bold text-secondary underline underline-offset-4">سجّل لتبدأ</Link>}
                  </div>
                </Reveal>
              );
            })}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { t: 'اقرأ النص', d: 'نص مشكول منسوب إلى مصدره وصفحته.' },
  { t: 'ضع علامتك', d: 'علّم ما يحتاج عودة، وسيحفظ موضع وقوفك.' },
  { t: 'ارجع وراجع', d: 'قائمة المراجعة تجمع علاماتك لتعود إليها.' },
  { t: 'اسأل أهل العلم', d: 'ما خرج عن المصادر يُحال عبر المساعد العلمي إلى معلم معتمد، عند تفعيله.' },
];
function Method() {
  return (
    <section id="method" className="scroll-mt-20 py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-5 md:px-10">
        <Reveal><Ornament /><h2 className="mt-6 text-center font-display text-4xl font-bold text-primary md:text-5xl">المنهجية</h2>
          <p className="mx-auto mt-5 max-w-2xl text-center font-arabic text-xl leading-loose text-foreground/80">لا إفتاء ولا اجتهاد. التقنية أداة مُعينة وليست بديلاً عن الشيخ والمعلم المعتمد.</p></Reveal>
        <ol className="relative mt-14 space-y-6 before:absolute before:bottom-4 before:right-6 before:top-4 before:w-px before:bg-secondary/40">
          {STEPS.map((s, i) => (
            <Reveal key={s.t} delay={i * 0.06}><li className="relative flex gap-6 pr-0">
              <span className="z-10 grid h-12 w-12 shrink-0 place-items-center rounded-full bg-secondary font-display text-lg font-bold text-secondary-foreground">{num(i + 1)}</span>
              <div className="paper-card flex-1 p-6"><h3 className="font-display text-xl font-bold">{s.t}</h3><p className="mt-1 font-arabic text-lg text-muted-foreground">{s.d}</p></div>
            </li></Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 border-t bg-card/50 py-20 md:py-28">
      <div className="mx-auto max-w-3xl px-5 md:px-10">
        <Reveal><h2 className="text-center font-display text-4xl font-bold text-primary md:text-5xl">الأسئلة الشائعة</h2></Reveal>
        <Accordion type="single" collapsible className="mt-10">
          {FAQ.map((f, i) => (
            <AccordionItem key={f.q} value={`q${i}`}><AccordionTrigger className="text-right font-display text-lg font-bold">{f.q}</AccordionTrigger>
              <AccordionContent className="font-arabic text-lg leading-loose text-muted-foreground">{f.a}</AccordionContent></AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section className="relative overflow-hidden bg-secondary py-24 text-secondary-foreground">
      <StarMark size={500} className="spin-slow absolute -bottom-48 right-1/2 translate-x-1/2 text-white/10" />
      <div className="relative mx-auto max-w-3xl px-5 text-center">
        <h2 className="font-display text-4xl font-bold leading-[1.4] md:text-5xl">افتح الحديث الأول، واقرأ</h2>
        <p className="mt-4 font-arabic text-xl opacity-90">لا نعدك بما لم يُبنَ بعد، ونعلن عن كل جديد حين يجهز.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/sign-up" className="rounded-full bg-background px-9 py-3.5 font-ui font-bold text-primary transition hover:-translate-y-1" data-testid="link-cta-student">ابدأ كطالب</Link>
          <Link href="/about" className="rounded-full border-2 border-white/60 px-9 py-3.5 font-ui font-bold" data-testid="link-cta-about">اعرف المزيد</Link>
        </div>
      </div>
    </section>
  );
}

function Helper() {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  return (
    <div className="fixed bottom-5 left-5 z-50">
      {open && (
        <div className="mb-3 w-[min(22rem,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border bg-card shadow-2xl" role="dialog" aria-label="المساعد التعريفي">
          <div className="bg-primary p-4 text-primary-foreground"><p className="font-display font-bold">المساعد التعريفي</p><p className="font-ui text-xs opacity-85">يجيب بنصوص معتمدة عن المنصة فقط، وليس مساعداً علمياً ولا ذكاءً اصطناعياً.</p></div>
          <div className="max-h-80 space-y-2 overflow-y-auto p-4">
            {sel !== null && <div className="rounded-xl bg-secondary/10 p-3 font-arabic leading-loose" data-testid="text-helper-answer">{FAQ[sel].a}</div>}
            {FAQ.map((f, i) => <button key={f.q} onClick={() => setSel(i)} className={cn('block w-full rounded-xl border px-3 py-2 text-right font-ui text-sm font-semibold hover:bg-muted', sel === i && 'border-secondary')}>{f.q}</button>)}
            <p className="pt-2 font-ui text-xs text-muted-foreground">لأسئلة تخصك، <Link href="/sign-in" className="font-bold text-secondary underline">سجّل الدخول</Link>.</p>
          </div>
        </div>
      )}
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-ui text-sm font-bold text-primary-foreground shadow-xl transition hover:-translate-y-0.5" aria-expanded={open} data-testid="button-helper">
        {open ? <X size={17} /> : <MessageCircleQuestion size={17} />} {open ? 'إغلاق' : 'عندي سؤال'}
      </button>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t bg-background py-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-5 md:flex-row md:px-10">
        <Logo className="h-12" />
        <p className="max-w-md text-center font-arabic text-base leading-loose text-muted-foreground">المحتوى المعروض قيد المراجعة العلمية ولا يغني عن الرجوع إلى أهل العلم.</p>
        <div className="flex gap-5 font-ui text-sm font-semibold"><Link href="/about">عن المنصة</Link><Link href="/sign-in">دخول</Link><a href="#faq" aria-label="الأسئلة"><Search size={16} className="inline" /> الأسئلة</a></div>
      </div>
    </footer>
  );
}

export default function Current() {
  usePageMeta('مَتِين | فضاء عربي لدراسة المتون العلمية', 'اقرأ الأربعين النووية بتشكيلها ومصدرها، وتابع موضع توقفك وعلاماتك في منصة مَتِين.');
  return (
    <div dir="rtl" className="min-h-[100dvh] bg-background">
      <Header />
      <main><Hero /><Features /><Simulator /><Tracks /><Method /><Faq /><Cta /></main>
      <Footer />
      <Helper />
    </div>
  );
}
