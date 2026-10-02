import { Link } from 'wouter';
import {
  getGetProgressQueryKey, getGetStudyTextQueryKey, useGetProgress, useGetStudyText,
} from '@workspace/api-client-react';
import { Bookmark, BookOpen } from 'lucide-react';
import { EmptyState, ErrorState, LoadingList, Notice, PageHeader } from '@/components/mateen/bits';
import { num, usePageMeta } from '@/lib/mateen';

export default function ReviewsPage() {
  usePageMeta('المراجعات | مَتِين', 'قائمة قراءة من المواضع التي وضعت عليها علامة.');
  const prog = useGetProgress({ query: { enabled: true, queryKey: getGetProgressQueryKey() } });
  const nawawi = prog.data?.find((p) => p.textId === 'nawawi');
  const marks = nawawi?.bookmarkedIds ?? [];
  const text = useGetStudyText('nawawi', { query: { enabled: marks.length > 0, queryKey: getGetStudyTextQueryKey('nawawi') } });

  return (
    <div>
      <PageHeader eyebrow="المراجعات" title="قائمة المراجعة">هذه قائمة قراءة بالمواضع التي وسمتها بعلامة. ليست جدولة متباعدة ولا قياساً لحفظك.</PageHeader>
      {prog.isLoading ? <LoadingList /> : prog.isError ? <ErrorState onRetry={() => prog.refetch()} /> : marks.length === 0 ? (
        <EmptyState icon={<Bookmark size={28} />} title="لا علامات بعد" action={<Link href="/student/study/nawawi" className="inline-flex items-center gap-2 rounded-full bg-secondary px-6 py-2.5 font-ui font-bold text-secondary-foreground"><BookOpen size={16} />افتح الدراسة</Link>}>
          ضع علامة على أي حديث أثناء القراءة ليظهر هنا للعودة إليه.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {text.isLoading && <LoadingList rows={2} />}
          {text.isError && <ErrorState message="تعذّر تحميل نصوص الأحاديث." onRetry={() => text.refetch()} />}
          {!text.isLoading && !text.isError && text.data && text.data.hadiths.length === 0 && <Notice title="النص غير متاح الآن">علاماتك محفوظة، لكن المصدر لم يرجع نصاً. حاول لاحقاً.</Notice>}
          {text.data?.hadiths.filter((h) => marks.includes(h.id)).map((h) => (
            <Link key={h.id} href={`/student/study/nawawi?h=${h.number}`} className="paper-card block p-6 transition hover:-translate-y-0.5" data-testid={`card-review-${h.id}`}>
              <p className="font-ui text-sm font-bold text-secondary">الحديث {num(h.number)} · {h.title}</p>
              <p className="hadith-text mt-2 line-clamp-3 text-xl">{h.text}</p>
            </Link>
          ))}
          {text.data && text.data.hadiths.length > 0 && marks.length > 0 && <p className="font-ui text-xs text-muted-foreground">آخر تحديث: {nawawi ? new Date(nawawi.updatedAt).toLocaleDateString('ar') : ''}</p>}
        </div>
      )}
    </div>
  );
}
