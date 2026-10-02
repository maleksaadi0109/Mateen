import { getGetReferralsQueryKey, useGetReferrals } from '@workspace/api-client-react';
import { MessageSquare } from 'lucide-react';
import { EmptyState, ErrorState, LoadingList, PageHeader } from '@/components/mateen/bits';
import { fmtDate, usePageMeta } from '@/lib/mateen';

export default function MessagesPage({ teacher = false }: { teacher?: boolean }) {
  usePageMeta('الرسائل | مَتِين', 'الإحالات الواردة من المساعد العلمي.');
  const q = useGetReferrals({ query: { enabled: true, queryKey: getGetReferralsQueryKey() } });
  return (
    <div>
      <PageHeader eyebrow="الرسائل" title={teacher ? 'صندوق الإحالات' : 'إحالاتك'}>
        {teacher ? 'تصلك هنا الإحالات بعد اعتمادك فقط.' : 'تُنشأ المحادثة مع المعلم من إحالة المساعد العلمي، وهو غير مفعّل بعد.'}
      </PageHeader>
      {q.isLoading ? <LoadingList /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <EmptyState icon={<MessageSquare size={28} />} title="لا إحالات">{teacher ? 'صندوقك فارغ، ولا شيء مفقود.' : 'ستظهر هنا إحالاتك حين يُفعَّل المساعد العلمي.'}</EmptyState>
      ) : (
        <div className="space-y-4">
          {q.data.map((r) => (
            <article key={r.id} className="paper-card p-6" data-testid={`card-referral-${r.id}`}>
              <div className="flex justify-between gap-3 font-ui text-xs text-muted-foreground"><span className="rounded-full border px-3 py-1 font-bold">{r.status}</span><span>{fmtDate(r.createdAt)}</span></div>
              <p className="mt-3 font-arabic text-lg leading-loose">{r.question}</p>
              <p className="mt-2 font-ui text-sm text-muted-foreground">سبب الإحالة: {r.reason}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
