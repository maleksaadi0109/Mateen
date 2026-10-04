import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { getGetMateenConversationMessagesQueryKey, getGetMateenConversationsQueryKey, getGetMateenConversationStatusQueryKey, getGetMateenTeacherReferralsQueryKey, useGetMateenConversationMessages, useGetMateenConversations, useGetMateenConversationStatus, useGetMateenTeacherReferrals, useReplyMateenReferral, useSendMateenFollowUp, useUpdateMateenReferralStatus } from '@workspace/api-client-react';
import type { TeacherReferral } from '@workspace/api-client-react';
import { ChevronDown, ChevronUp, MessageSquare, Search, Send } from 'lucide-react';
import { EmptyState, ErrorState, LoadingList, PageHeader } from '@/components/mateen/bits';
import BookMascot from '@/components/mateen/book-mascot';
import { ChatMessages } from '@/components/scholarly/ChatMessages';
import { StatusPill, btnGhost, btnPrimary, field, useFinitePoll } from '@/components/scholarly/shared';
import { fmtDate, usePageMeta } from '@/lib/mateen';
import { useToast } from '@/hooks/use-toast';
import { useMessageDraft } from '@/hooks/use-message-draft';
import { draftOwner, messageDrafts } from '@/lib/message-drafts';

const linkedConversation = () => new URLSearchParams(window.location.search).get('conversation');
const BLOCKED = ['not_referred', 'waiting_for_teacher'];

export function Thread({ owner, conversationId, teacher, referralId, referralClosed = false }: { owner: string; conversationId: string; teacher: boolean; referralId?: string; referralClosed?: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const threadKey = JSON.stringify([teacher ? 'teacher' : 'student', conversationId, referralId ?? null]);
  const { text, requestId, saved, setText } = useMessageDraft(owner, threadKey);
  const [tick, setTick] = useState(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [, navigate] = useLocation();
  const poll = useFinitePoll(6000, 300000, tick);
  const msgs = useGetMateenConversationMessages(conversationId, { query: { enabled: true, queryKey: getGetMateenConversationMessagesQueryKey(conversationId), refetchInterval: poll } });
  const status = useGetMateenConversationStatus(conversationId, { query: { enabled: true, queryKey: getGetMateenConversationStatusQueryKey(conversationId), refetchInterval: poll } });
  const follow = useSendMateenFollowUp();
  const reply = useReplyMateenReferral();
  const done = () => {
    if (mounted.current) setTick((t) => t + 1);
    qc.invalidateQueries({ queryKey: getGetMateenConversationMessagesQueryKey(conversationId) });
    qc.invalidateQueries({ queryKey: getGetMateenConversationStatusQueryKey(conversationId) });
    qc.invalidateQueries({ queryKey: getGetMateenConversationsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetMateenTeacherReferralsQueryKey() });
  };
  const fail = () => toast({ title: 'تعذّر إرسال الرسالة', variant: 'destructive' });
  const send = async () => {
    const t = text.trim(); if (!t || locked || !messageDrafts.active(owner)) return;
    const generation = messageDrafts.generation();
    try {
      // Await the mutation rather than per-call callbacks: acknowledgement must
      // still remove the sent draft if the user collapsed/navigated away meanwhile.
      const answer = teacher
        ? await reply.mutateAsync({ referralId: referralId!, data: { text: t, requestId } })
        : await follow.mutateAsync({ conversationId, data: { text: t, requestId } });
      if (!messageDrafts.active(owner, generation)) return;
      messageDrafts.acknowledge(owner, threadKey, requestId, generation);
      done();
      if (mounted.current && !teacher && 'conversationId' in answer && answer.conversationId !== conversationId) navigate('/student/assistant');
    } catch {
      if (messageDrafts.active(owner, generation)) fail();
    }
  };
  const locked = follow.isPending || reply.isPending || (teacher && (!referralId || referralClosed)) || !status.data || status.isError || status.data.status === 'closed' || BLOCKED.includes(status.data.referral.status);
  const hasAssistant = (msgs.data ?? []).some((m) => m.role === 'assistant');
  return (
    <div className="mt-4 space-y-3 border-t border-dashed pt-4" data-testid={`thread-${conversationId}`}>
      {status.data && <p className="font-ui text-xs text-muted-foreground" data-testid="text-thread-status">حالة الإحالة: {status.data.referral.status === 'not_referred' ? 'دون إحالة' : <StatusPill status={status.data.referral.status} />}</p>}
      {status.isError && <ErrorState message="تعذّر قراءة حالة المحادثة؛ الإرسال متوقف." onRetry={() => status.refetch()} />}
      {hasAssistant && <p className="rounded-xl bg-muted px-3 py-2 font-ui text-xs leading-6 text-muted-foreground" data-testid="text-assistant-warning">ردود المساعد آلية وقد تخطئ. ميّزها عن ردود المعلم، ولا تعدّها فتوى معتمدة.</p>}
      <div className="max-h-[28rem] overflow-y-auto rounded-2xl bg-background/60 p-2 sm:p-3">
        {msgs.isLoading ? <LoadingList rows={2} /> : msgs.isError ? <ErrorState onRetry={() => msgs.refetch()} /> : <ChatMessages messages={msgs.data ?? []} viewer={teacher ? 'teacher' : 'student'} />}
      </div>
      {!teacher && status.data && (BLOCKED.includes(status.data.referral.status) || status.data.status === 'closed') && <p className="font-ui text-xs text-muted-foreground">{status.data.status === 'closed' ? 'المحادثة مغلقة، فلا يمكن الرد.' : 'لا يوجد معلم مكلّف بهذه المحادثة بعد. للأسئلة الجديدة استخدم المساعد؛ وللإحالة راجع السؤال في سجلّه.'}</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <textarea className={`${field} font-arabic min-w-0`} rows={3} maxLength={8000} placeholder="رد نصي ضمن الإحالة؛ للأسئلة الجديدة استخدم المساعد" aria-label="نص الرسالة" aria-describedby="message-draft-notice" value={text} onChange={(e) => setText(e.target.value)} disabled={locked} data-testid="input-message" />
        <button className={`${btnPrimary} shrink-0`} disabled={!text.trim() || locked} onClick={send} data-testid="button-send-message"><Send size={15} className="rotate-180" /> إرسال</button>
      </div>
      <p id="message-draft-notice" role={saved ? undefined : 'alert'} className="font-ui text-xs text-muted-foreground" data-testid="text-draft-notice">
        {saved ? 'المسودة خاصة بحسابك في علامة التبويب هذه، وتبقى عند إعادة التحميل. تُحذف عند تسجيل الخروج أو تبديل الحساب أو إغلاق علامة التبويب، ولا تُرسل تلقائيًا.' : 'تعذّر حفظ المسودة في المتصفح. قد تفقدها عند إعادة التحميل؛ انسخ النص قبل المغادرة.'}
      </p>
    </div>
  );
}

function Toggle({ open, onClick, label, id }: { open: boolean; onClick: () => void; label: string; id: string }) {
  return <button className={btnGhost} aria-expanded={open} onClick={onClick} data-testid={`button-open-${id}`}>{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}{open ? 'إخفاء' : label}</button>;
}

function Meta({ status, date }: { status: string; date: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-2"><StatusPill status={status} /><span className="font-ui text-xs text-muted-foreground">{fmtDate(date)}</span></div>;
}

export function StudentView({ owner }: { owner: string }) {
  const poll = useFinitePoll(15000);
  const q = useGetMateenConversations({ query: { queryKey: getGetMateenConversationsQueryKey(), refetchInterval: poll } });
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(linkedConversation);
  const term = search.trim();
  const items = (q.data ?? []).filter((c) => (filter === 'all' || c.status === filter) && (!term || c.topic.includes(term)));
  const statuses = Array.from(new Set((q.data ?? []).map((c) => c.status)));
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="تصفية الحالة" className="flex flex-wrap gap-2">
          {['all', ...statuses].map((s) => <button key={s} aria-pressed={filter === s} className={filter === s ? btnPrimary : btnGhost} onClick={() => setFilter(s)} data-testid={`filter-${s}`}>{s === 'all' ? 'الكل' : <StatusPill status={s} />}</button>)}
        </div>
        <div className="relative w-full sm:ms-auto sm:max-w-xs"><Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input className={`${field} ps-9`} maxLength={200} placeholder="ابحث في المحادثات" aria-label="بحث" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search" /></div>
      </div>
      {q.isLoading ? <LoadingList /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !items.length ? (
        <EmptyState icon={<BookMascot size={72} mood="rest" />} title="لا محادثات" action={<Link href="/student/assistant" className={btnPrimary} data-testid="link-assistant">اسأل المساعد</Link>}>تبدأ المحادثات من سؤال للمساعد العلمي. ولا يمكن مراسلة معلم مباشرة.</EmptyState>
      ) : (
        <div className="space-y-4">{items.map((c) => (
          <article key={c.id} className={`paper-card p-4 sm:p-6 ${open === c.id ? 'ring-2 ring-secondary/40' : ''}`} data-testid={`card-conversation-${c.id}`}>
            <Meta status={c.status} date={c.updatedAt} />
            <p className="mt-3 break-words font-arabic text-lg leading-loose">{c.topic}</p>
            <div className="mt-3"><Toggle open={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)} label="فتح المحادثة" id={c.id} /></div>
            {open === c.id && <Thread owner={owner} conversationId={c.id} teacher={false} />}
          </article>
        ))}</div>
      )}
    </>
  );
}

export function TeacherView({ owner }: { owner: string }) {
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
        <div role="group" aria-label="تصفية الحالة" className="flex flex-wrap gap-2">
          {([[undefined, 'الكل'], ['open', 'بانتظار الرد'], ['answered', 'أُجيب'], ['closed', 'مغلقة']] as const).map(([s, l]) => <button key={l} aria-pressed={status === s} className={status === s ? btnPrimary : btnGhost} onClick={() => setStatus(s)} data-testid={`filter-${s ?? 'all'}`}>{l}</button>)}
        </div>
        <div className="relative w-full sm:ms-auto sm:max-w-xs"><Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input className={`${field} ps-9`} maxLength={200} placeholder="بحث" aria-label="بحث" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search" /></div>
      </div>
      {q.isLoading ? <LoadingList /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <EmptyState icon={<BookMascot size={72} mood="rest" />} title="لا إحالات">صندوقك فارغ، ولا شيء مفقود. تصلك الإحالات من طلاب وافقوا على مشاركتها.</EmptyState>
      ) : (
        <div className="space-y-4">{q.data.map((r) => {
          const isOpen = open === r.id || open === r.conversationId;
          return (
            <article key={r.id} className={`paper-card p-4 sm:p-6 ${isOpen ? 'ring-2 ring-secondary/40' : ''}`} data-testid={`card-referral-${r.id}`}>
              <Meta status={r.status} date={r.createdAt} />
              <p className="mt-2 break-words font-arabic text-lg leading-loose">{r.question}</p>
              {r.context && <p className="break-words font-arabic text-sm text-muted-foreground">{r.context}</p>}
              <p className="mt-1 font-ui text-sm text-muted-foreground">سبب الإحالة: {r.reason}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Toggle open={isOpen} onClick={() => setOpen(isOpen ? null : r.id)} label="فتح والرد" id={r.id} />
                <button className={btnGhost} disabled={upd.isPending} onClick={() => setSt(r, r.status === 'open' ? 'answered' : 'open')} data-testid={`button-toggle-${r.id}`}>{r.status === 'open' ? 'علّم كمُجاب' : 'أعد الفتح'}</button>
                {r.status !== 'closed' && <button className={btnGhost} disabled={upd.isPending} onClick={() => setSt(r, 'closed')} data-testid={`button-close-${r.id}`}>إغلاق الإحالة</button>}
              </div>
              {isOpen && <Thread owner={owner} conversationId={r.conversationId} referralId={r.id} referralClosed={r.status === 'closed'} teacher />}
            </article>
          );
        })}</div>
      )}
    </>
  );
}

export default function MessagesPage({ teacher = false }: { teacher?: boolean }) {
  const { isLoaded, userId, sessionId } = useAuth();
  const owner = isLoaded && userId && sessionId ? draftOwner(userId, sessionId) : null;
  useLayoutEffect(() => {
    if (isLoaded) messageDrafts.claim(owner);
  }, [isLoaded, owner]);
  usePageMeta('الرسائل | مَتِين', 'محادثات الإحالة بين الطالب والمعلم المعتمد.');
  if (!owner) return null;
  return (
    <div>
      <PageHeader eyebrow="الرسائل" title={teacher ? 'صندوق الإحالات' : 'محادثاتك'}>
        {teacher ? 'تصلك هنا الإحالات التي وافق الطلاب على مشاركتها معك.' : 'محادثات المساعد وإحالاتك في مكان واحد. الرد على المعلم يُتاح بعد تكليفه بالإحالة.'}
      </PageHeader>
      {teacher ? <TeacherView key={owner} owner={owner} /> : <StudentView key={owner} owner={owner} />}
    </div>
  );
}
