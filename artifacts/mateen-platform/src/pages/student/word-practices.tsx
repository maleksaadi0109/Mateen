import { tr } from '@/lib/i18n';
import { useState } from 'react';
import { BookOpen, Plus } from 'lucide-react';
import { getGetStudyTextQueryKey, useGetStudyText } from '@workspace/api-client-react';
import { ErrorState, PageHeader } from '@/components/mateen/bits';
import { SavedWordPractices } from '@/components/mateen/saved-word-practices';
import WordPractice from '@/components/mateen/word-practice';
import { num, usePageMeta } from '@/lib/mateen';

export default function WordPracticesPage() {
  usePageMeta(tr("الكلمات الصعبة | مَتِين"), tr("اختر كلمات من الأربعين النووية وتدرّب عليها، ثم احفظ تمارينك لتعود إليها."));
  const text = useGetStudyText('nawawi', {
    query: { queryKey: getGetStudyTextQueryKey('nawawi') },
  });
  const [selected, setSelected] = useState('');
  const [practice, setPractice] = useState<{ id: number; title: string } | null>(null);
  const hadiths = text.data?.hadiths ?? [];
  const hadith = hadiths.find((item) => String(item.id) === selected);

  if (practice) {
    return <WordPractice hadith={practice} onClose={() => setPractice(null)} />;
  }

  return (
    <div className="space-y-6" data-testid="page-word-practices">
      <PageHeader eyebrow={tr("تدريب شخصي")} title={tr("الكلمات الصعبة")}>{tr("تمارين تختار كلماتها بنفسك، وليست أخطاء مؤكدة أو درجات إتقان.")}</PageHeader>
      <section className="paper-card p-5 sm:p-7" aria-labelledby="new-word-practice-title">
        <h2 id="new-word-practice-title" className="flex items-center gap-2 font-display text-xl font-bold">
          <BookOpen size={22} className="shrink-0 text-secondary" />{' '}{tr("إنشاء تمرين جديد")}</h2>
        <p className="mt-2 font-ui text-sm leading-relaxed text-muted-foreground">{tr("اختر حديثًا من الأربعين النووية، ثم حدّد المقطع والكلمات التي تريد التدرب عليها. لا تحتاج إلى تقرير تسميع سابق.")}</p>
        {text.isLoading ? <p role="status" className="mt-4 font-ui text-sm">{tr("جارٍ تحميل الأحاديث…")}</p>
          : text.isError ? <div className="mt-4"><ErrorState message={tr("تعذّر تحميل الأحاديث. حاول مجددًا.")} onRetry={() => text.refetch()} /></div>
          : hadiths.length === 0 ? <p className="mt-4 font-ui text-sm">{tr("النص غير متاح الآن. تمارينك المحفوظة تبقى في القسم أدناه.")}</p>
          : <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => {
            event.preventDefault();
            if (hadith) setPractice({ id: hadith.id, title: hadith.title });
          }}>
            <label className="grid min-w-0 flex-1 gap-2 font-ui text-sm font-semibold">{tr("الحديث")}<select value={selected} onChange={(event) => setSelected(event.target.value)}
                className="min-h-12 w-full min-w-0 rounded-xl border bg-background px-3 text-base"
                data-testid="select-word-practice-hadith">
                <option value="">{tr("اختر حديثًا")}</option>
                {hadiths.map((item) => <option key={item.id} value={String(item.id)}>{tr("الحديث")}{' '}{num(item.number)} · {item.title}</option>)}
              </select>
            </label>
            <button type="submit" disabled={!hadith} data-testid="button-new-word-practice"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-ui text-sm font-bold text-primary-foreground disabled:opacity-50">
              <Plus size={18} />{' '}{tr("اختر الكلمات")}</button>
          </form>}
      </section>
      <SavedWordPractices />
    </div>
  );
}
