import { Link } from 'wouter';
import { getGetCatalogQueryKey, useGetCatalog } from '@workspace/api-client-react';
import { Lock, ArrowLeft, ExternalLink, Info } from 'lucide-react';
import { EmptyState, ErrorState, LoadingList, PageHeader, Reveal } from '@/components/mateen/bits';
import { num, usePageMeta } from '@/lib/mateen';

const B = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const img = (f: string) => `${B}images/book-covers/${f}`;

type Cover = { file: string; w: number; h: number; caption: string; source: string; url: string };
const COVERS = {
  nawawi: { file: 'nawawi.jpg', w: 313, h: 500, caption: 'غلاف متن الأربعين النووية', source: 'أمازون', url: 'https://m.media-amazon.com/images/I/51mvG4BNT1L.jpg' },
  nawaqid: { file: 'nawaqid.jpg', w: 349, h: 500, caption: 'غلاف «فتح القدوس السلام بشرح نواقض الإسلام»', source: 'نصيحة', url: 'https://nasihaa.com/uploads/img/1679391879_SXT9H.jpg' },
  qawaid: { file: 'qawaid.jpg', w: 673, h: 1000, caption: 'غلاف «المطلع في شرح القواعد الأربع»', source: 'سلة', url: 'https://cdn.salla.sa/YvENm/vYEE9FDGPk05b67szO9e9SQKeKaSWsIHtJTQMHgY.jpg' },
  tuhfa: { file: 'tuhfa-crop.webp', w: 332, h: 482, caption: 'غلاف «شرح تحفة الأطفال»', source: 'مكتبة دبي', url: 'https://shop.dubailibrary.com/cdn/shop/files/10_11c4f424-26a3-4954-b283-8843883d022a_800x.jpg?v=1695022480' },
} satisfies Record<string, Cover>;

function coverFor(id: string): Cover | undefined {
  return Object.hasOwn(COVERS, id) ? COVERS[id as keyof typeof COVERS] : undefined;
}

function Photo({ c, className = '', eager = false }: { c: Cover | undefined; className?: string; eager?: boolean }) {
  if (!c) return <p className="font-ui text-sm text-muted-foreground">لا تتوفر صورة لهذا المتن.</p>;
  return (
    <img src={img(c.file)} width={c.w} height={c.h} alt={c.caption} loading={eager ? 'eager' : 'lazy'} decoding="async"
      className={`block h-auto w-full rounded-[3px] ${className}`} />
  );
}

const credit = 'font-ui inline-flex items-center gap-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-secondary hover:underline';

export default function TracksPage() {
  usePageMeta('المسارات | مَتِين', 'المتون المتاحة والمقبلة في مَتِين.');
  const q = useGetCatalog({ query: { enabled: true, queryKey: getGetCatalogQueryKey() } });
  const items = q.data ?? [];
  const isOpen = (t: { id: string; status: string }) => t.status === 'available' && t.id === 'nawawi';
  const openItems = items.filter(isOpen);
  const soon = items.filter((t) => !isOpen(t));

  return (
    <div>
      <PageHeader eyebrow="المسارات" title="المتون والمستويات">متن واحد مفتوح اليوم. أما المتون الأخرى فمغلقة بوسم «قريباً» ولا يمكن دراستها قبل نشرها.</PageHeader>
      {q.isLoading ? <LoadingList rows={4} /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !items.length ? <EmptyState title="لا متون في الفهرس">سيظهر الفهرس هنا عند توفره.</EmptyState> : (
        <div className="space-y-10">
          <div className="flex items-start gap-3 rounded-2xl border border-secondary/30 bg-secondary/5 px-4 py-3" data-testid="note-covers-disclaimer">
            <Info size={18} className="mt-1 shrink-0 text-secondary" aria-hidden />
            <p className="font-ui text-sm leading-relaxed text-foreground/80">الأغلفة للتعريف بالمتون؛ صور الشروح لا تعني اعتمادها للدراسة.</p>
          </div>

          {openItems.map((t) => {
            const c = COVERS.nawawi;
            return (
              <Reveal key={t.id}>
                <Link href="/student/learn/nawawi" data-testid={`card-track-${t.id}`}
                  className="mateen-track-card group relative block overflow-hidden rounded-[1.75rem] border border-secondary/25 bg-gradient-to-l from-[hsl(36_55%_90%)] to-[hsl(40_50%_97%)] p-6 shadow-[0_30px_60px_-38px_hsl(19_28%_33%/.6)] sm:p-9">
                  <div className="star-pattern pointer-events-none absolute inset-0 opacity-40" aria-hidden />
                  <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,15rem)_1fr] lg:gap-12">
                    <div className="mateen-track-cover mx-auto w-48 lg:w-full">
                      <Photo c={c} eager className="shadow-[0_28px_40px_-18px_hsl(19_40%_20%/.75),0_0_0_1px_hsl(19_20%_20%/.15)]" />
                    </div>
                    <div className="min-w-0">
                      <span className="inline-flex rounded-full bg-secondary px-3 py-1 font-ui text-xs font-bold text-secondary-foreground">مفتوح للدراسة</span>
                      <p className="mt-4 font-ui text-sm font-semibold text-secondary">{t.track} · {t.level}</p>
                      <h2 className="mt-2 font-display text-3xl font-bold leading-snug sm:text-4xl">{t.title}</h2>
                      <p className="mt-4 max-w-xl font-arabic text-lg leading-loose text-foreground/75">{t.description}</p>
                      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
                        <span className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-ui text-sm font-bold text-primary-foreground transition-transform motion-safe:group-hover:-translate-x-1">
                          خريطة المراحل <ArrowLeft size={16} aria-hidden />
                        </span>
                        <span className="font-ui text-sm text-muted-foreground">{num(t.hadithCount)} موضعاً</span>
                      </div>
                    </div>
                  </div>
                </Link>
                <p className="mt-2 px-2 font-ui text-[11px] text-muted-foreground">
                  {c.caption} — المصدر:{' '}
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className={credit} data-testid={`link-credit-${t.id}`}>{c.source}<ExternalLink size={11} aria-hidden /></a>
                </p>
              </Reveal>
            );
          })}

          {soon.length > 0 && (
            <section aria-labelledby="soon-h">
              <div className="mb-5 flex items-center gap-3">
                <h2 id="soon-h" className="font-display text-xl font-bold">متون قادمة</h2>
                <span className="h-px flex-1 bg-border" aria-hidden />
                <span className="inline-flex items-center gap-1.5 font-ui text-xs text-muted-foreground"><Lock size={13} aria-hidden />لم تُنشر بعد</span>
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
                            <p className="font-ui text-xs font-semibold text-secondary">{t.track} · {t.level}</p>
                            <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/50 px-2.5 py-0.5 font-ui text-xs font-bold text-muted-foreground"><Lock size={11} aria-hidden />قريباً</span>
                          </div>
                          <h3 className="mt-2 font-display text-lg font-bold leading-snug">{t.title}</h3>
                          <p className="mt-2 font-arabic text-base leading-loose text-muted-foreground">{t.description}</p>
                          {c && <p className="mt-auto pt-4 font-ui text-[11px] text-muted-foreground">
                            {c.caption} —{' '}
                            <a href={c.url} target="_blank" rel="noopener noreferrer" className={credit} data-testid={`link-credit-${t.id}`}>{c.source}<ExternalLink size={11} aria-hidden /></a>
                          </p>}
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
