import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPracticeReportWords } from '@workspace/api-client-react';
import { num } from '@/lib/mateen';
import type { HadithAnalysis } from '@/lib/recitation-analysis';
import { IssueRow } from './recitation-report';
import type { useArabicSpeech } from './recitation-history';

export function SavedReportWords({ id, userId, hadith, speech }: {
  id: string; userId: string; hadith: HadithAnalysis; speech: ReturnType<typeof useArabicSpeech>;
}) {
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: ['practice-report-words', userId, id, hadith.id, offset],
    queryFn: ({ signal }) => getPracticeReportWords(id, hadith.id, offset, { signal }),
    staleTime: 0, refetchOnWindowFocus: true,
  });
  if (query.isLoading) return <p role="status" className="mt-3 text-xs">جارٍ تحميل اختلافات الكلمات…</p>;
  if (query.isError) return <p role="alert" className="mt-3 text-xs text-destructive">تعذّر تحميل تفاصيل الكلمات. <button onClick={() => void query.refetch()} className="underline">إعادة المحاولة</button></p>;
  const data = query.data;
  return <div className="mt-3" data-testid={`saved-report-words-${hadith.number}`}>
    {data?.total === 0 ? <p className="text-xs text-muted-foreground">لا توجد اختلافات كلمات محفوظة لهذا الحديث.</p> : <>
      <p className="mb-2 text-xs text-muted-foreground">الاختلافات {num(offset + 1)}–{num(offset + (data?.issues.length ?? 0))} من {num(data?.total ?? 0)}. المقارنة بالمحاولات السابقة غير متاحة لهذا التقرير المسترجع.</p>
      <ul className="space-y-2">{data?.issues.map((i, k) => <IssueRow key={`${offset}-${k}`} issue={i} hadithStart={hadith.start} prior={null} speech={speech} />)}</ul>
      <div className="mt-3 flex gap-3 text-xs">
        {offset > 0 && <button className="min-h-9 rounded-full border px-3" onClick={() => setOffset(Math.max(0, offset - 50))}>الاختلافات السابقة</button>}
        {data?.hasMore && <button className="min-h-9 rounded-full border px-3" data-testid={`report-words-next-${hadith.number}`} onClick={() => setOffset(offset + 50)}>الاختلافات التالية</button>}
      </div>
    </>}
  </div>;
}