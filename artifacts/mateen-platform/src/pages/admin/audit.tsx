import { tr } from '@/lib/i18n';
import { useState } from 'react';
import { getGetReviewAuditQueryKey, useGetReviewAudit } from '@workspace/api-client-react';
import { AdminGate } from '@/components/admin/AdminGate';
import { EmptyState, ErrorState, LoadingList, PageHeader } from '@/components/mateen/bits';
import { errMsg } from '@/lib/admin';
import { fmtDate, usePageMeta } from '@/lib/mateen';

function Audit() {
  const q = useGetReviewAudit({ query: { queryKey: getGetReviewAuditQueryKey(), refetchInterval: 30_000 } });
  const [f, setF] = useState('');
  if (q.isLoading) return <LoadingList rows={5} />;
  if (q.isError || !q.data) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  const rows = q.data.filter((r) => !f || [r.action, r.actorId, r.targetId, r.reason].some((x) => x.includes(f)));
  return (
    <div>
      <PageHeader eyebrow={tr("مركز المراجعة")} title={tr("سجل المراجعة")}>{tr("سجل للإضافة فقط، يقتصر على نطاق صلاحيتك.")}</PageHeader>
      <input value={f} onChange={(e) => setF(e.target.value)} placeholder={tr("تصفية بالإجراء أو المعرّف أو السبب")} className="mb-4 w-full rounded-xl border bg-background px-4 py-2.5 font-ui outline-none focus:border-secondary" data-testid="input-audit-filter" />
      {!rows.length ? <EmptyState title={tr("لا سجلات")}>{tr("لم تُسجَّل قرارات في نطاقك بعد.")}</EmptyState> : (
        <div className="paper-card overflow-x-auto" data-testid="table-audit">
          <table className="w-full min-w-[640px] text-start font-ui text-sm">
            <thead><tr className="border-b text-xs text-muted-foreground"><th className="p-3">{tr("الوقت")}</th><th className="p-3">{tr("الإجراء")}</th><th className="p-3">{tr("الهدف")}</th><th className="p-3">{tr("المراجع")}</th><th className="p-3">{tr("السبب")}</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="border-b align-top last:border-0">
                <td className="whitespace-nowrap p-3">{fmtDate(r.createdAt)}</td><td className="p-3 font-bold">{r.action}</td>
                <td className="p-3 font-mono text-xs" dir="ltr">{r.targetId}</td><td className="p-3 font-mono text-xs" dir="ltr">{r.actorId}</td>
                <td className="p-3 font-arabic text-base leading-loose">{r.reason}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
export default function AdminAudit() {
  usePageMeta(tr("سجل المراجعة | مَتِين"), tr("سجل قرارات المراجعة."));
  return <AdminGate>{() => <Audit />}</AdminGate>;
}
