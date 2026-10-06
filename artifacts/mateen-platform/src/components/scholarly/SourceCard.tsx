import { tr } from '@/lib/i18n';
import { useState } from 'react';
import { useGetMateenMessageSourceStatus, getGetMateenMessageSourceStatusQueryKey } from '@workspace/api-client-react';
import type { Citation } from '@workspace/api-client-react';
import { ChevronDown, ShieldAlert } from 'lucide-react';
import { CitationList, type StatusView } from './shared';

function Body({ messageId, citations }: { messageId: string; citations: Citation[] }) {
  const q = useGetMateenMessageSourceStatus(messageId, {
    query: { queryKey: getGetMateenMessageSourceStatusQueryKey(messageId), enabled: true, refetchOnMount: 'always', staleTime: 0 },
  });
  // Fail closed: never show cached state while a fresh fetch is pending or after an error.
  const status: StatusView = q.isFetching ? { phase: 'pending', items: [] }
    : q.isError || !q.data ? { phase: 'error', items: [], retry: () => { void q.refetch(); } }
    : { phase: 'ready', items: q.data };
  return (
    <div className="mt-3 space-y-3">
      <p className="flex gap-2 rounded-xl bg-muted/60 p-3 font-ui text-xs leading-relaxed text-muted-foreground" data-testid={`source-warning-${messageId}`}>
        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-secondary" />
        <span>{tr("الأهلية للاسترجاع في هذه المكتبة ليست اعتماداً علمياً أو حقوقياً مستقلاً، ووجود الاقتباس لا يثبت صحة ما ولّده المساعد من كلام آخر.")}</span>
      </p>
      <CitationList citations={citations} status={status} />
    </div>
  );
}

export function SourceCard({ messageId, citations }: { messageId: string; citations: Citation[] }) {
  const [open, setOpen] = useState(false);
  if (!citations.length) return null;
  return (
    <details
      className="group mt-3 min-w-0 rounded-2xl border border-secondary/30 bg-card"
      data-testid={`references-${messageId}`}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-2 font-ui text-sm font-bold text-secondary marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 break-words">{tr("من أين جاءت الإجابة؟")}{' '}<span className="font-normal text-muted-foreground">({citations.length})</span></span>
        <ChevronDown size={16} className="shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-3 pb-3 sm:px-4">{open && <Body messageId={messageId} citations={citations} />}</div>
    </details>
  );
}
