import { type ReactNode } from 'react';
import { Link } from 'wouter';
import { getGetCapabilitiesQueryKey, useGetCapabilities } from '@workspace/api-client-react';
import { Sparkles } from 'lucide-react';
import { ErrorState, LoadingList, Notice, PageHeader } from '@/components/mateen/bits';
import { usePageMeta } from '@/lib/mateen';

function Unavailable({ eyebrow, title, icon, lead, ready, children }: { eyebrow: string; title: string; icon: ReactNode; lead: string; ready: (c: { assistantReady: boolean; examsReady: boolean }) => boolean; children: ReactNode }) {
  const q = useGetCapabilities({ query: { enabled: true, queryKey: getGetCapabilitiesQueryKey() } });
  return (
    <div>
      <PageHeader eyebrow={eyebrow} title={title}>{lead}</PageHeader>
      {q.isLoading ? <LoadingList rows={1} /> : q.isError || !q.data ? <ErrorState onRetry={() => q.refetch()} /> : (
        <div className="space-y-5">
          <div className="paper-card star-pattern p-10 text-center">
            <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full border border-secondary/40 bg-card text-secondary">{icon}</div>
            <h2 className="font-display text-2xl font-bold" data-testid="text-unavailable">{ready(q.data) ? 'الخدمة مفعّلة من الخادم' : 'غير متاح في هذا الإصدار'}</h2>
            <div className="mx-auto mt-3 max-w-lg font-arabic text-lg leading-loose text-muted-foreground">{children}</div>
          </div>
          {q.data.notice && <Notice title="إشعار المنصة">{q.data.notice}</Notice>}
          <Link href="/student/study/nawawi" className="inline-block font-ui font-bold text-secondary underline underline-offset-4">ارجع إلى القراءة</Link>
        </div>
      )}
    </div>
  );
}

export function AssistantPage() {
  usePageMeta('المساعد العلمي | مَتِين', 'المساعد العلمي غير مفعّل بعد.');
  return (
    <Unavailable eyebrow="المساعد العلمي" title="المساعد العلمي" icon={<Sparkles size={28} />} ready={(c) => c.assistantReady}
      lead="سيجيب من كتب الشروح المعتمدة مع ذكر المصدر والصفحة، ويحيل ما عداه إلى معلم معتمد.">
      لا يُعرض هنا أي جواب حتى تكتمل مراجعة المصادر. لا فتاوى ولا اجتهاد.
    </Unavailable>
  );
}
