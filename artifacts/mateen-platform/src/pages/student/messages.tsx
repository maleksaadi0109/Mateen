import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { getGetMateenConversationMessagesQueryKey, getGetMateenConversationsQueryKey, getGetMateenConversationStatusQueryKey, getGetMateenTeacherReferralsQueryKey, useGetMateenConversationMessages, useGetMateenConversations, useGetMateenConversationStatus, useGetMateenTeacherReferrals, useReplyMateenReferral, useSendMateenFollowUp, useUpdateMateenReferralStatus } from '@workspace/api-client-react';
import type { TeacherReferral } from '@workspace/api-client-react';
import { MessageSquare } from 'lucide-react';
import { EmptyState, ErrorState, LoadingList, PageHeader } from '@/components/mateen/bits';
import { ChatMessages } from '@/components/scholarly/ChatMessages';
import { StatusPill, btnGhost, btnPrimary, field, useFinitePoll } from '@/components/scholarly/shared';
import { fmtDate, usePageMeta } from '@/lib/mateen';
import { useToast } from '@/hooks/use-toast';

const ROLE: Record<string, string> = { student: 'الطالب', assistant: 'المساعد', teacher: 'المعلم' };
const linkedConversation = () => new URLSearchParams(window.location.search).get('conversation');

function Thread({ conversationId, teacher, referralId }: { conversationId: string; teacher: boolean; referralId?: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [tick, setTick] = useState(0);
  const [, navigate] = useLocation();
  const poll = useFinitePoll(6000, 300000, tick);
  const msgs = useGetMateenConversationMessages(conversationId, { query: { enabled: true, queryKey: getGetMateenConversationMessagesQueryKey(conversationId), refetchInterval: poll } });
  const status = useGetMateenConversationStatus(conversationId, { query: { enabled: true, queryKey: getGetMateenConversationStatusQueryKey(conversationId), refetchInterval: poll } });
  const follow = useSendMateenFollowUp();
  const reply = useReplyMateenReferral();
  const done = () => {
    setText(''); setRequestId(crypto.randomUUID()); setTick((t) => t + 1);
    qc.invalidateQueries({ queryKey: getGetMateenConversationMessagesQueryKey(conversationId) });
    qc.invalidateQueries({ queryKey: getGetMateenConversationStatusQueryKey(conversationId) });
    qc.invalidateQueries({ queryKey: getGetMateenConversationsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetMateenTeacherReferralsQueryKey() });
  };
  const fail = () => toast({ title: 'تعذّر إرسال الرسالة', variant: 'destructive' });
  const send = () => {
    const t = text.trim(); if (!t) return;
    if (teacher && referralId) reply.mutate({ referralId, data: { text: t, requestId } }, { onSuccess: done, onError: fail });
    else follow.mutate({ conversationId, data: { text: t, requestId } }, { onSuccess: (answer) => { done(); if (answer.conversationId !== conversationId) navigate('/student/assistant'); }, onError: fail });
  };
  return (
    <div className="mt-4 space-y-3 border-t pt-4" data-testid={`thread-${conversationId}`}>
      {status.data && <p className="font-ui text-xs text-muted-foreground" data-testid="text-thread-status">حالة الإحالة: {status.data.referral.status === 'not_referred' ? 'دون إحالة' : <StatusPill status={status.data.referral.status} />}</p>}
      {msgs.isLoading ? <LoadingList rows={2} /> : msgs.isError ? <ErrorState onRetry={() => msgs.refetch()} /> : (
        <ChatMessages messages={msgs.data ?? []} viewer={teacher ? 'teacher' : 'student'} />
      )}
      {!teacher && ['not_referred', 'waiting_for_teacher'].includes(status.data?.referral.status ?? '') && <p className="font-ui text-xs text-muted-foreground">لا يوجد معلم مكلّف بهذه المحادثة بعد. للأسئلة الجديدة استخدم المساعد؛ وللإحالة راجع السؤال في سجلّه.</p>}
      <textarea className={`${field} font-arabic`} rows={3} maxLength={8000} placeholder="رد نصي ضمن الإحالة؛ للأسئلة الجديدة استخدم المساعد" value={text} onChange={(e) => { setText(e.target.value); setRequestId(crypto.randomUUID()); }} disabled={follow.isPending || reply.isPending || !status.data || status.data.status === 'closed' || ['not_referred', 'waiting_for_teacher'].includes(status.data.referral.status)} data-testid="input-message" />
      <button className={btnPrimary} disabled={!text.trim() || follow.isPending || reply.isPending || !status.data || status.data.status === 'closed' || ['not_referred', 'waiting_for_teacher'].includes(status.data.referral.status)} onClick={send} data-testid="button-send-message">إرسال</button>
    </div>
  );
}

function StudentView() {
  const poll = useFinitePoll(15000);
  const q = useGetMateenConversations({ query: { queryKey: getGetMateenConversationsQueryKey(), refetchInterval: poll } });
  const [filter, setFilter] = useState('all');
   const [open, setOpen] = useState<string | null>(linkedConversation);
  const items = (q.data ?? []).filter((c) => filter === 'all' || c.status === filter);
  const statuses = Array.from(new Set((q.data ?? []).map((c) => c.status)));
  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2" role="tablist">
        {['all', ...statuses].map((s) => <button key={s} className={filter === s ? btnPrimary : btnGhost} onClick={() => setFilter(s)} data-testid={`filter-${s}`}>{s === 'all' ? 'الكل' : <StatusPill status={s} />}</button>)}
      </div>
      {q.isLoading ? <LoadingList /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !items.length ? (
        <EmptyState icon={<MessageSquare size={28} />} title="لا محادثات" action={<Link href="/student/assistant" className={btnPrimary} data-testid="link-assistant">اسأل المساعد</Link>}>تبدأ المحادثات من سؤال للمساعد العلمي. ولا يمكن مراسلة معلم مباشرة.</EmptyState>
      ) : (
        <div className="space-y-4">{items.map((c) => (
          <article key={c.id} className="paper-card p-6" data-testid={`card-conversation-${c.id}`}>
            <div className="flex justify-between gap-3"><StatusPill status={c.status} /><span className="font-ui text-xs text-muted-foreground">{fmtDate(c.updatedAt)}</span></div>
            <p className="mt-3 font-arabic text-lg leading-loose">{c.topic}</p>
            <button className={`${btnGhost} mt-3`} onClick={() => setOpen(open === c.id ? null : c.id)} data-testid={`button-open-${c.id}`}>{open === c.id ? 'إخفاء' : 'فتح المحادثة'}</button>
            {open === c.id && <Thread conversationId={c.id} teacher={false} />}
          </article>
        ))}</div>
      )}
    </>
  );
}

function TeacherView() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState<'open' | 'answered' | 'closed' | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(linkedConversation);
  const poll = useFinitePoll(10000);
  const params = { ...(status ? { status } : {}), ...(search.trim() ? { q: search.trim().slice(0, 200) } : {}) };
  const q = useGetMateenTeacherReferrals(params, { query: { queryKey: getGetMateenTeacherReferralsQueryKey(params), refetchInterval: poll } });
  const upd = useUpdateMateenReferralStatus();
  const setSt = (r: TeacherReferral, s: 'open' | 'answered' | 'closed') => upd.mutate({ referralId: r.id, data: { status: s } }, {
    onSuccess: () => { qc.invalidateQueries({ queryKey: getGetMateenTeacherReferralsQueryKey() }); qc.invalidateQueries({ queryKey: getGetMateenConversationsQueryKey() }); qc.invalidateQueries({ queryKey: getGetMateenConversationStatusQueryKey(r.conversationId) }); }, onError: () => toast({ title: 'تعذّر تغيير الحالة', variant: 'destructive' }),
  });
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {([[undefined, 'الكل'], ['open', 'بانتظار الرد'], ['answered', 'أُجيب'], ['closed', 'مغلقة']] as const).map(([s, l]) => <button key={l} className={status === s ? btnPrimary : btnGhost} onClick={() => setStatus(s)} data-testid={`filter-${s ?? 'all'}`}>{l}</button>)}
        <input className={`${field} max-w-xs`} maxLength={200} placeholder="بحث" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search" />
      </div>
      {q.isLoading ? <LoadingList /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <EmptyState icon={<MessageSquare size={28} />} title="لا إحالات">صندوقك فارغ، ولا شيء مفقود. تصلك الإحالات من طلاب وافقوا على مشاركتها.</EmptyState>
      ) : (
        <div className="space-y-4">{q.data.map((r) => (
          <article key={r.id} className="paper-card p-6" data-testid={`card-referral-${r.id}`}>
            <div className="flex justify-between gap-3"><StatusPill status={r.status} /><span className="font-ui text-xs text-muted-foreground">{fmtDate(r.createdAt)}</span></div>
            <p className="mt-2 font-arabic text-lg leading-loose">{r.question}</p>
            {r.context && <p className="font-arabic text-sm text-muted-foreground">{r.context}</p>}
            <p className="mt-1 font-ui text-sm text-muted-foreground">سبب الإحالة: {r.reason}</p>
            <div className="mt-3 flex gap-2">
              <button className={btnGhost} onClick={() => setOpen(open === r.id || open === r.conversationId ? null : r.id)} data-testid={`button-open-${r.id}`}>{open === r.id || open === r.conversationId ? 'إخفاء' : 'فتح والرد'}</button>
              <button className={btnGhost} disabled={upd.isPending} onClick={() => setSt(r, r.status === 'open' ? 'answered' : 'open')} data-testid={`button-toggle-${r.id}`}>{r.status === 'open' ? 'علّم كمُجاب' : 'أعد الفتح'}</button>
              {r.status !== 'closed' && <button className={btnGhost} disabled={upd.isPending} onClick={() => setSt(r, 'closed')} data-testid={`button-close-${r.id}`}>إغلاق الإحالة</button>}
            </div>
             {(open === r.id || open === r.conversationId) && <Thread conversationId={r.conversationId} referralId={r.id} teacher />}
          </article>
        ))}</div>
      )}
    </>
  );
}

export default function MessagesPage({ teacher = false }: { teacher?: boolean }) {
  usePageMeta('الرسائل | مَتِين', 'محادثات الإحالة بين الطالب والمعلم المعتمد.');
  return (
    <div>
      <PageHeader eyebrow="الرسائل" title={teacher ? 'صندوق الإحالات' : 'محادثاتك'}>
        {teacher ? 'تصلك هنا الإحالات التي وافق الطلاب على مشاركتها معك.' : 'تُنشأ المحادثة من إحالة المساعد العلمي فقط، ويمكنك الرد داخلها.'}
      </PageHeader>
      {teacher ? <TeacherView /> : <StudentView />}
    </div>
  );
}
