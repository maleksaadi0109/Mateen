import { fmt } from '@/lib/i18n';
import { tr } from '@/lib/i18n';
import { Link, useSearch, useLocation } from 'wouter';
import { getGetCatalogQueryKey, useGetCatalog } from '@workspace/api-client-react';
import { Lock, ArrowLeft, ArrowRight, ScrollText, Landmark, Mic2, Scale } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState, ErrorState, LoadingList, PageHeader, Reveal } from '@/components/mateen/bits';
import { num, usePageMeta } from '@/lib/mateen';

const B = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const img = (f: string) => `${B}images/book-covers/${f}`;

type Cover = { file: string; w: number; h: number; caption: string; source: string; url: string };
const COVERS = {
  nawawi: { file: 'nawawi-mateen.png', w: 802, h: 1280, get caption() { return tr("غلاف الأربعين النووية بتصميم مَتِين"); }, get source() { return tr("صورة مقدمة من المستخدم"); }, url: '' },
  nawaqid: { file: 'nawaqid-mateen.png', w: 802, h: 1280, get caption() { return tr("غلاف نواقض الإسلام بتصميم مَتِين"); }, get source() { return tr("صورة مقدمة من المستخدم"); }, url: '' },
  qawaid: { file: 'qawaid-mateen.png', w: 802, h: 1280, get caption() { return tr("غلاف القواعد الأربع بتصميم مَتِين"); }, get source() { return tr("صورة مقدمة من المستخدم"); }, url: '' },
  tuhfa: { file: 'tuhfa-mateen.png', w: 802, h: 1280, get caption() { return tr("غلاف متن تحفة الأطفال لسليمان الجمزوري بتصميم مَتِين"); }, get source() { return tr("صورة مقدمة من المستخدم؛ نسبة المؤلف المطبوعة على الصورة تحتاج تصحيحاً"); }, url: '' },
} satisfies Record<string, Cover>;

function coverFor(id: string): Cover | undefined {
  return Object.hasOwn(COVERS, id) ? COVERS[id as keyof typeof COVERS] : undefined;
}

function Photo({ c, className = '', eager = false }: { c: Cover | undefined; className?: string; eager?: boolean }) {
  if (!c) return <p className="font-ui text-sm text-muted-foreground">{tr("لا تتوفر صورة لهذا المتن.")}</p>;
  return (
    <img src={img(c.file)} width={c.w} height={c.h} alt={c.caption} loading={eager ? 'eager' : 'lazy'} decoding="async"
      className={`block h-auto w-full rounded-[3px] ${className}`} />
  );
}

type TrackDef = { key: string; name: string; blurb: string; ids: string[]; Icon: LucideIcon; tint: string };
const TRACKS: TrackDef[] = [
  { key: 'hadith', get name() { return tr("الحديث"); }, get blurb() { return tr("جوامع الكلم النبوي حفظاً وفهماً."); }, ids: ['nawawi'], Icon: ScrollText, tint: 'from-[hsl(27_80%_88%)] to-[hsl(40_60%_96%)] dark:from-[hsl(27_40%_18%)] dark:to-[hsl(24_12%_13%)]' },
  { key: 'aqida', get name() { return tr("العقيدة"); }, get blurb() { return tr("أصول التوحيد وما يناقضه."); }, ids: ['nawaqid', 'qawaid'], Icon: Landmark, tint: 'from-[hsl(19_35%_86%)] to-[hsl(36_45%_96%)] dark:from-[hsl(19_25%_18%)] dark:to-[hsl(24_12%_13%)]' },
  { key: 'tajwid', get name() { return tr("التجويد والقراءات"); }, get blurb() { return tr("أحكام التلاوة نظماً وتطبيقاً."); }, ids: ['tuhfa'], Icon: Mic2, tint: 'from-[hsl(45_70%_85%)] to-[hsl(41_50%_96%)] dark:from-[hsl(45_35%_16%)] dark:to-[hsl(24_12%_13%)]' },
  { key: 'fiqh', get name() { return tr("الفقه"); }, get blurb() { return tr("متون الأحكام العملية."); }, ids: [], Icon: Scale, tint: 'from-[hsl(30_20%_88%)] to-[hsl(36_30%_96%)] dark:from-[hsl(30_10%_17%)] dark:to-[hsl(24_12%_13%)]' },
];

export default function TracksPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const sel = TRACKS.find((t) => t.key === new URLSearchParams(search).get('track'));
  usePageMeta(tr("المسارات | مَتِين"), tr("المتون المتاحة والمقبلة في مَتِين."));
  const q = useGetCatalog({ query: { enabled: true, queryKey: getGetCatalogQueryKey() } });
  const items = q.data ?? [];
  const isOpen = (t: { id: string; status: string }) => t.status === 'available' && (t.id === 'nawawi' || t.id === 'tuhfa');
  const scoped = sel ? items.filter((t) => sel.ids.includes(t.id)) : [];
  const openItems = scoped.filter(isOpen);
  const soon = scoped.filter((t) => !isOpen(t));
  const countFor = (d: TrackDef) => items.filter((t) => d.ids.includes(t.id)).length;

  return (
    <div>
      <PageHeader eyebrow={sel ? tr("المسارات") : tr("اختر مساراً")} title={sel ? fmt("مسار {a}", "{a} track", { a: sel.name }) : tr("المسارات العلمية")}>{sel ? sel.blurb : tr("أربعة مسارات، ولكل مسار متونه.")}</PageHeader>
      {sel && (
        <button type="button" onClick={() => navigate('/student/tracks')} data-testid="button-back-tracks"
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-secondary/40 bg-card px-5 py-2.5 font-ui text-sm font-bold text-secondary transition-colors hover:bg-secondary/10">
          <ArrowRight size={16} aria-hidden />{' '}{tr("كل المسارات")}</button>
      )}
      {q.isLoading ? <LoadingList rows={4} /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !items.length ? <EmptyState title={tr("لا متون في الفهرس")}>{tr("سيظهر الفهرس هنا عند توفره.")}</EmptyState> : !sel ? (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2" aria-label={tr("المسارات")}>
          {TRACKS.map((d, i) => {
            const n = countFor(d);
            return (
              <li key={d.key}>
                <Reveal delay={i * 0.06} className="h-full">
                  <Link href={`/student/tracks?track=${d.key}`} data-testid={`card-subject-${d.key}`}
                    className={`mateen-track-card group relative flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-secondary/25 bg-gradient-to-bl ${d.tint} p-6 shadow-[0_24px_50px_-36px_hsl(19_28%_33%/.6)] sm:p-7`}>
                    <div className="star-pattern pointer-events-none absolute inset-0 opacity-30" aria-hidden />
                    <div className="relative flex items-start justify-between gap-4">
                      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground"><d.Icon size={26} aria-hidden /></span>
                      <span className="rounded-full border border-secondary/30 bg-card/70 px-3 py-1 font-ui text-xs font-bold text-secondary">
                        {n ? `${num(n)} ${n === 1 ? tr("متن") : tr("متون")}` : tr("قريباً")}
                      </span>
                    </div>
                    <h2 className="relative mt-6 font-display text-2xl font-bold">{d.name}</h2>
                    <p className="relative mt-2 flex-1 font-arabic text-lg leading-loose text-foreground/75">{d.blurb}</p>
                    <span className="relative mt-5 inline-flex items-center gap-2 font-ui text-sm font-bold text-secondary">{tr("عرض المتون")}{' '}<ArrowLeft size={16} aria-hidden className="transition-transform motion-safe:group-hover:-translate-x-1" />
                    </span>
                  </Link>
                </Reveal>
              </li>
            );
          })}
        </ul>
      ) : !scoped.length ? (
        <EmptyState title={tr("قريباً")}>{tr("لم تُضف متون لهذا المسار بعد، وستظهر هنا عند نشرها.")}</EmptyState>
      ) : (
        <div className="space-y-10">
          {openItems.map((t) => {
            const c = coverFor(t.id);
            return (
              <Reveal key={t.id}>
                <Link href={`/student/learn/${t.id}`} data-testid={`card-track-${t.id}`}
                  className="mateen-track-card group relative block overflow-hidden rounded-[1.75rem] border border-secondary/25 bg-gradient-to-l from-[hsl(36_55%_90%)] to-[hsl(40_50%_97%)] p-6 shadow-[0_30px_60px_-38px_hsl(19_28%_33%/.6)] sm:p-9">
                  <div className="star-pattern pointer-events-none absolute inset-0 opacity-40" aria-hidden />
                  <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,15rem)_1fr] lg:gap-12">
                    <div className="mateen-track-cover mx-auto w-48 lg:w-full">
                      <Photo c={c} eager className="shadow-[0_28px_40px_-18px_hsl(19_40%_20%/.75),0_0_0_1px_hsl(19_20%_20%/.15)]" />
                    </div>
                    <div className="min-w-0">
                      <span className="inline-flex rounded-full bg-secondary px-3 py-1 font-ui text-xs font-bold text-secondary-foreground">{tr("مفتوح للدراسة")}</span>
                      <p className="mt-4 font-ui text-sm font-semibold text-secondary">{tr(t.track)} · {tr(t.level)}</p>
                      <h2 className="mt-2 font-display text-3xl font-bold leading-snug sm:text-4xl">{tr(t.title)}</h2>
                      <p className="mt-4 max-w-xl font-arabic text-lg leading-loose text-foreground/75">{tr(t.description)}</p>
                      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
                        <span className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-ui text-sm font-bold text-primary-foreground transition-transform motion-safe:group-hover:-translate-x-1">
                          {t.id === 'tuhfa' ? tr("أبواب التحفة") : tr("خريطة المراحل")} <ArrowLeft size={16} aria-hidden />
                        </span>
                        <span className="font-ui text-sm text-muted-foreground">{num(t.hadithCount)} {t.id === 'tuhfa' ? tr("أبيات") : tr("موضعاً")}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              </Reveal>
            );
          })}

          {soon.length > 0 && (
            <section aria-labelledby="soon-h">
              <div className="mb-5 flex items-center gap-3">
                <h2 id="soon-h" className="font-display text-xl font-bold">{tr("متون قادمة")}</h2>
                <span className="h-px flex-1 bg-border" aria-hidden />
                <span className="inline-flex items-center gap-1.5 font-ui text-xs text-muted-foreground"><Lock size={13} aria-hidden />{tr("لم تُنشر بعد")}</span>
              </div>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
                {soon.map((t, i) => {
                  const c = coverFor(t.id);
                  return (
                    <Reveal key={t.id} delay={i * 0.08}>
                      <div aria-disabled="true" data-testid={`card-track-${t.id}`} className="paper-card flex h-full flex-col overflow-hidden">
                        <div className="flex justify-center bg-[hsl(36_30%_91%)] px-6 pb-5 pt-7">
                          <div className="w-36 sm:w-40">
                            <Photo c={c} className="shadow-[0_18px_28px_-14px_hsl(19_40%_20%/.7),0_0_0_1px_hsl(19_20%_20%/.15)]" />
                          </div>
                        </div>
                        <div className="flex flex-1 flex-col p-5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-ui text-xs font-semibold text-secondary">{tr(t.track)} · {tr(t.level)}</p>
                            <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/50 px-2.5 py-0.5 font-ui text-xs font-bold text-muted-foreground"><Lock size={11} aria-hidden />{tr("قريباً")}</span>
                          </div>
                          <h3 className="mt-2 font-display text-lg font-bold leading-snug">{tr(t.title)}</h3>
                          <p className="mt-2 font-arabic text-base leading-loose text-muted-foreground">{tr(t.description)}</p>
                        </div>
                      </div>
                    </Reveal>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
