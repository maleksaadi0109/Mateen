import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { askMateenAssistant, sendMateenFollowUp, getGetMateenAssistantQuestionsQueryKey, getGetMateenAssistantReadinessQueryKey, getGetMateenConversationMessagesQueryKey, getGetMateenConversationStatusQueryKey, getGetMateenConversationsQueryKey, useAskMateenAssistant, useGetMateenAssistantQuestions, useGetMateenAssistantReadiness, useGetMateenConversationMessages, useGetMateenConversationStatus, useReportScholarlyIssue, useSendMateenFollowUp } from '@workspace/api-client-react';
import type { AssistantQuestion } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { BookOpen, History, MessagesSquare, Plus, Search, SendHorizontal, ShieldAlert, X } from 'lucide-react';
import { ErrorState, LoadingList } from '@/components/mateen/bits';
import { ChatMessages } from '@/components/scholarly/ChatMessages';
import { Field, NO_FATWA, StatusPill, btnGhost, btnPrimary, field } from '@/components/scholarly/shared';
import { ReferralPanel } from '@/components/scholarly/ReferralPanel';
import { fmtDate, usePageMeta } from '@/lib/mateen';
import { useToast } from '@/hooks/use-toast';
import { boundedChatRequest } from '@/lib/chat-request';

const STUDY_BOOKS = [
  { id: 'nawawi', title: 'الأربعون النووية' },
  { id: 'usul-thalatha', title: 'الأصول الثلاثة' },
  { id: 'tuhfa', title: 'تحفة الأطفال' },
] as const;
type StudyBookId = (typeof STUDY_BOOKS)[number]['id'];

function IssueForm({ questionId, onDone }: { questionId: string; onDone: () => void }) {
  const [category, setCategory] = useState<'citation' | 'unsupported_claim' | 'safety' | 'other'>('citation');
  const [description, setDescription] = useState('');
  const m = useReportScholarlyIssue();
  const { toast } = useToast();
  return (
    <div className="mt-4 space-y-3 rounded-2xl border bg-background p-4" data-testid="form-issue">
      <Field label="نوع المشكلة">
        <select className={field} value={category} onChange={(e) => setCategory(e.target.value as typeof category)} data-testid="select-issue-category">
          <option value="citation">اقتباس أو إحالة خاطئة</option><option value="unsupported_claim">ادعاء بلا سند</option><option value="safety">مسألة سلامة</option><option value="other">أخرى</option>
        </select>
      </Field>
      <Field label="الوصف"><textarea className={field} rows={3} minLength={3} maxLength={3000} value={description} onChange={(e) => setDescription(e.target.value)} data-testid="input-issue-description" /></Field>
      <button className={btnPrimary} disabled={description.trim().length < 3 || m.isPending} data-testid="button-submit-issue"
        onClick={() => m.mutate({ data: { questionId, category, description: description.trim() } }, { onSuccess: () => { toast({ title: 'وصل بلاغك إلى المراجعين' }); onDone(); }, onError: () => toast({ title: 'تعذّر إرسال البلاغ', variant: 'destructive' }) })}>إرسال البلاغ</button>
    </div>
  );
}

const STARTERS = ['عرّفني بالمتن وموضوعاته الأساسية', 'اقترح لي طريقة لمذاكرة هذا المتن', 'ما الذي ينبغي فهمه قبل دراسة هذا المتن؟'];
const bookTitle = (id: string) => STUDY_BOOKS.find((b) => b.id === id)?.title ?? id;

export default function AssistantPage() {
  usePageMeta('المساعد العلمي | مَتِين', 'محادثة تعليمية مع المساعد الآلي، وإحالة إلى معلم عند الحاجة.');
  const qc = useQueryClient();
  const { toast } = useToast();
  const ready = useGetMateenAssistantReadiness({ query: { queryKey: getGetMateenAssistantReadinessQueryKey() } });
  const poll = 8000;
  const hist = useGetMateenAssistantQuestions({ query: { queryKey: getGetMateenAssistantQuestionsQueryKey(), refetchInterval: poll } });
  const ask = useAskMateenAssistant({ mutation: { retry: false, mutationFn: ({ data }) =>
    boundedChatRequest((signal) => askMateenAssistant(data, { signal })) } });
  const follow = useSendMateenFollowUp({ mutation: { retry: false, mutationFn: ({ conversationId, data }) =>
    boundedChatRequest((signal) => sendMateenFollowUp(conversationId, data, { signal })) } });
  const [sel, setSel] = useState<string | null>(null); // null = new conversation
  const [bookId, setBookId] = useState<StudyBookId | ''>('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [referralOpen, setReferralOpen] = useState(false);
  const [issue, setIssue] = useState(false);
  const [query, setQuery] = useState('');
  const [histOpen, setHistOpen] = useState(false);
  const reqId = useRef<{ key: string; text: string; id: string }>({ key: '', text: '', id: crypto.randomUUID() });
  const pending = ask.isPending || follow.isPending;
  const [slowPending, setSlowPending] = useState(false);
  const [sendError, setSendError] = useState('');
  useEffect(() => {
    setSlowPending(false);
    if (!pending) return;
    const timer = window.setTimeout(() => setSlowPending(true), 15_000);
    return () => window.clearTimeout(timer);
  }, [pending]);
  const key = sel ?? 'new';
  const text = drafts[key] ?? '';
  const setText = (v: string) => setDrafts((d) => ({ ...d, [key]: v }));

  const threads = useMemo(() => {
    const map = new Map<string, AssistantQuestion[]>();
    for (const q of hist.data ?? []) map.set(q.conversationId, [...(map.get(q.conversationId) ?? []), q]);
    return Array.from(map.entries()).map(([id, qs]) => {
      const sorted = [...qs].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
      return { id, first: sorted[0], latest: sorted[sorted.length - 1] };
    }).sort((a, b) => +new Date(b.latest.createdAt) - +new Date(a.latest.createdAt));
  }, [hist.data]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => [t.first.question, t.latest.question, bookTitle(t.first.textId)].some((v) => v.toLowerCase().includes(q)));
  }, [threads, query]);
  const thread = threads.find((t) => t.id === sel);
  const latest = thread?.latest;

  const msgs = useGetMateenConversationMessages(sel ?? '', { query: { enabled: !!sel, queryKey: getGetMateenConversationMessagesQueryKey(sel ?? ''), refetchInterval: sel ? poll : false } });
  const status = useGetMateenConversationStatus(sel ?? '', { query: { enabled: !!sel, queryKey: getGetMateenConversationStatusQueryKey(sel ?? ''), refetchInterval: sel ? poll : false } });
  const canCompose = sel ? (!!status.data && !status.isError) : (!!ready.data && !ready.isError && !!bookId);
  const refStatus = status.data?.referral.status ?? latest?.referral.status ?? 'not_referred';
  const closed = status.data?.status === 'closed';
  const waiting = refStatus === 'waiting_for_teacher';
  const withTeacher = refStatus === 'awaiting_reply' || refStatus === 'answered';
  const abstainedOpen = !!latest && latest.status === 'abstained' && refStatus === 'not_referred';
  const autoPanel = abstainedOpen && !dismissed.includes(latest!.questionId);
  const showPanel = !!latest && !closed && (referralOpen || autoPanel);

  useEffect(() => { setReferralOpen(false); setIssue(false); setHistOpen(false); }, [sel]);

  const refresh = (cid?: string) => {
    qc.invalidateQueries({ queryKey: getGetMateenAssistantQuestionsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetMateenConversationsQueryKey() });
    if (cid) { qc.invalidateQueries({ queryKey: getGetMateenConversationMessagesQueryKey(cid) }); qc.invalidateQueries({ queryKey: getGetMateenConversationStatusQueryKey(cid) }); }
  };
  const nextReq = (k: string, t: string) => {
    if (reqId.current.key !== k || reqId.current.text !== t) reqId.current = { key: k, text: t, id: crypto.randomUUID() };
    return reqId.current.id;
  };
  const failToast = (err?: unknown) => {
    const timedOut = err instanceof Error && ['TimeoutError', 'AbortError'].includes(err.name);
    const description = timedOut
      ? 'تأخر اتصال المساعد وانتهت مهلة الانتظار. نصك محفوظ؛ راجع المحادثات المحفوظة قبل إعادة الإرسال، فقد يكون الطلب وصل للخادم.'
      : 'تعذّر الحصول على الرد. نصك محفوظ في الحقل؛ يمكنك إعادة المحاولة.';
    setSendError(description);
    toast({ title: timedOut ? 'انتهت مهلة انتظار الرد' : 'تعذّر الإرسال', description, variant: 'destructive' });
  };
  const clearDraft = (k: string) => {
    if (reqId.current.key === k) reqId.current = { key: '', text: '', id: crypto.randomUUID() };
    setDrafts((d) => { const n = { ...d }; delete n[k]; return n; });
  };

  const send = () => {
    const t = text.trim();
    if (!t || pending || waiting || closed || !canCompose) return;
    setSendError('');
    if (!sel) {
      if (!bookId) return;
      ask.mutate({ data: { question: t, textId: bookId, textContext: null } }, {
        onSuccess: (a) => { clearDraft('new'); refresh(a.conversationId); setSel(a.conversationId); },
        onError: async (err) => {
          const qid = (err as { data?: { questionId?: string } } | null)?.data?.questionId;
           const res = qid ? await boundedChatRequest(() => hist.refetch(), 5000).catch(() => null) : null;
           const found = qid ? res?.data?.find((q) => q.questionId === qid) : undefined;
          if (found) {
            clearDraft('new'); refresh(found.conversationId); setSel(found.conversationId);
            toast({ title: 'حُفظ سؤالك', description: 'تعذّر على المساعد الجواب الآن. السؤال محفوظ في المحادثة، ولم يُرسل شيء مكرراً.' });
           } else failToast(err);
        },
      });
    } else {
      const cid = sel;
      follow.mutate({ conversationId: cid, data: { text: t, requestId: nextReq(cid, t) } }, {
        onSuccess: () => { clearDraft(cid); refresh(cid); },
        onError: async (err) => {
          const qid = (err as { data?: { questionId?: string } } | null)?.data?.questionId;
           const res = qid ? await boundedChatRequest(() => hist.refetch(), 5000).catch(() => null) : null;
           if (qid && res?.data?.some(q => q.questionId === qid && q.conversationId === cid)) {
            clearDraft(cid);
            toast({ title: 'حُفظت رسالتك', description: 'تعذّر على المساعد الجواب. يمكنك إحالة الحوار إلى معلم دون إعادة إرسال الرسالة.' });
           } else failToast(err);
          refresh(cid);
        },
      });
    }
  };

  const lockedBook = thread ? thread.first.textId : bookId;
  const placeholder = withTeacher ? 'اكتب رسالتك إلى المعلم' : 'اكتب سؤالك أو متابعتك';
  const blocked = waiting ? 'طلبك بانتظار معلم معتمد متاح. أوقف المساعد الإجابة في هذه المحادثة حتى يُسند إليها معلم.' : closed ? 'أُغلقت هذه المحادثة وهي للقراءة فقط.' : '';

  const inputDisabled = pending || !!blocked || !canCompose;
  const historyList = (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <label className="relative block">
        <Search size={15} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-muted-foreground" />
        <input type="search" maxLength={200} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث في محادثاتك" aria-label="ابحث في المحادثات"
          className="w-full rounded-full border bg-background py-2 pe-3 ps-9 font-ui text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary" data-testid="input-search-conversations" />
      </label>
      {hist.isLoading ? <LoadingList rows={4} /> : hist.isError ? <ErrorState onRetry={() => hist.refetch()} /> : !threads.length ? (
        <div className="rounded-2xl border border-dashed p-5 text-center font-ui text-sm text-muted-foreground" data-testid="text-no-conversations">
          <MessagesSquare size={22} className="mx-auto mb-2 text-secondary" />لا محادثات محفوظة بعد. تُحفظ محادثاتك هنا تلقائياً.
        </div>
      ) : !filtered.length ? (
        <div className="rounded-2xl border border-dashed p-5 text-center font-ui text-sm text-muted-foreground" data-testid="text-no-search-results">
          لا نتائج تطابق «{query.trim()}».
          <button className="mt-2 block w-full font-bold text-secondary" onClick={() => setQuery('')} data-testid="button-clear-search">امسح البحث</button>
        </div>
      ) : (
        <ul className="-me-1 min-h-0 flex-1 space-y-1 overflow-y-auto pe-1">
          {filtered.map((t) => {
            const active = t.id === sel;
            return (
              <li key={t.id}>
                <button disabled={pending && !active} onClick={() => { setSel(t.id); setHistOpen(false); }} data-testid={`button-thread-${t.id}`} aria-current={active ? 'true' : undefined}
                  className={`relative block w-full min-w-0 rounded-xl px-3 py-2.5 text-start transition-colors disabled:opacity-50 ${active ? 'bg-card shadow-sm ring-1 ring-secondary/40' : 'hover:bg-card/70'}`}>
                  {active && <span className="absolute inset-y-2 start-0 w-1 rounded-full bg-secondary" aria-hidden="true" />}
                  <span className="block truncate font-arabic text-[15px] leading-relaxed">{t.first.question}</span>
                  <span className="mt-0.5 flex items-center justify-between gap-2 font-ui text-[11px] text-muted-foreground">
                    <span className="truncate">{bookTitle(t.first.textId)}</span><span className="shrink-0">{fmtDate(t.latest.createdAt)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-ui text-xs font-bold tracking-wide text-secondary">المساعد العلمي</p>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">مجلس السؤال</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className={`${btnGhost} lg:hidden`} onClick={() => setHistOpen((v) => !v)} aria-expanded={histOpen} data-testid="button-toggle-history"><History size={15} />المحادثات{threads.length ? ` (${threads.length})` : ''}</button>
          <button className={btnPrimary} disabled={pending} onClick={() => { setSel(null); setHistOpen(false); }} data-testid="button-new-conversation"><Plus size={15} />محادثة جديدة</button>
        </div>
      </header>
      {ready.isError && <ErrorState message="تعذّر قراءة حالة المساعد؛ الإرسال موقوف حتى تنجح القراءة." onRetry={() => ready.refetch()} />}

      <div className="grid gap-4 lg:h-[calc(100dvh-var(--mateen-assistant-height)-11rem)] lg:min-h-[30rem] lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className={`${histOpen ? 'flex' : 'hidden'} max-h-[50dvh] min-w-0 flex-col rounded-3xl border bg-muted/40 p-3 lg:flex lg:max-h-none`} data-testid="list-conversations">
          <p className="mb-2 px-1 font-ui text-xs font-bold text-muted-foreground">المحادثات المحفوظة</p>
          {historyList}
        </aside>

        <section className="paper-card flex h-[calc(100dvh-var(--mateen-assistant-height)-16rem)] min-h-[22rem] min-w-0 flex-col overflow-hidden p-0 lg:h-auto" data-testid="card-chat">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-6">
            {sel ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <BookOpen size={16} className="text-secondary" />
                <span className="font-ui text-sm font-bold" data-testid="text-question-book">الكتاب: {bookTitle(lockedBook)}</span>
                {refStatus !== 'not_referred' && <StatusPill status={refStatus} />}
              </div>
            ) : (
              <label className="flex min-w-0 flex-wrap items-center gap-2 font-ui text-sm font-bold">
                <BookOpen size={16} className="text-secondary" />الكتاب
                <select className="rounded-full border bg-card px-3 py-1.5 font-ui text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary" value={bookId} disabled={pending} data-testid="select-study-book"
                  onChange={(e) => setBookId(STUDY_BOOKS.find((b) => b.id === e.target.value)?.id ?? '')}>
                  <option value="" disabled>اختر الكتاب</option>
                  {STUDY_BOOKS.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
                </select>
              </label>
            )}
            {latest && <button className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-ui text-xs font-semibold text-muted-foreground hover:bg-muted" onClick={() => setIssue((v) => !v)} aria-expanded={issue} data-testid={`button-report-${latest.questionId}`}>{issue ? <X size={14} /> : <ShieldAlert size={14} />}أبلغ عن مشكلة</button>}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {issue && latest && <div className="mb-4"><IssueForm questionId={latest.questionId} onDone={() => setIssue(false)} /></div>}
            {!sel ? (
              <div className="mx-auto flex max-w-xl flex-col items-center py-6 text-center" data-testid="text-chat-empty">
                <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-secondary/10 text-secondary"><BookOpen size={26} /></span>
                <p className="font-display text-xl font-bold">{bookId ? `اسأل عن ${bookTitle(bookId)}` : 'ابدأ باختيار الكتاب'}</p>
                <p className="mt-2 font-arabic leading-loose text-muted-foreground">{bookId ? 'اكتب سؤالك، وتابع في المحادثة نفسها. يُثبَّت الكتاب بعد أول سؤال.' : 'اختر المتن الذي تدرسه ليكون سياقاً لسؤالك. يُثبَّت الكتاب بعد أول سؤال.'}</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2" role="group" aria-label="اختر الكتاب">
                  {STUDY_BOOKS.map((b) => (
                    <button key={b.id} disabled={pending} onClick={() => setBookId(b.id)} aria-pressed={bookId === b.id} data-testid={`button-book-${b.id}`}
                      className={`rounded-full border px-4 py-2 font-arabic text-sm transition-colors disabled:opacity-50 ${bookId === b.id ? 'border-secondary bg-secondary text-secondary-foreground' : 'bg-card hover:border-secondary/60'}`}>{b.title}</button>
                  ))}
                </div>
                {bookId && (
                  <div className="mt-6 w-full space-y-2">
                    <p className="font-ui text-xs text-muted-foreground">مقترحات تملأ الحقل فقط، ولا تُرسل تلقائياً</p>
                    {STARTERS.map((s, i) => (
                      <button key={s} disabled={inputDisabled} onClick={() => setText(s)} data-testid={`button-starter-${i}`}
                        className="block w-full rounded-xl border border-dashed bg-background px-4 py-2.5 text-start font-arabic text-sm hover:border-secondary/60 disabled:opacity-50">{s}</button>
                    ))}
                  </div>
                )}
              </div>
            ) : msgs.isLoading ? <LoadingList rows={3} /> : msgs.isError ? <ErrorState onRetry={() => msgs.refetch()} /> : <ChatMessages messages={msgs.data ?? []} viewer="student" />}
            {pending && (
              <div className="mt-3 flex items-center gap-3 rounded-2xl border bg-background px-4 py-3 font-ui text-sm text-muted-foreground" role="status" data-testid="text-pending">
                <span className="flex gap-1" aria-hidden="true">{[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-secondary" style={{ animationDelay: `${i * 150}ms` }} />)}</span>
                {slowPending ? 'تأخر اتصال النموذج. الانتظار محدود؛ ستظهر الإجابة أو رسالة توضّح تعذّر الرد.' : 'المساعد يجهّز الرد...'}
              </div>
            )}
            {!pending && sendError && <p className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 font-ui text-sm text-destructive" role="alert" data-testid="text-send-error">{sendError}</p>}
            {sel && status.isError && <div className="mt-3"><ErrorState message="تعذّر التحقق من حالة المحادثة؛ لم تُرسل رسالة جديدة." onRetry={() => status.refetch()} /></div>}
            {showPanel && latest && <ReferralPanel key={latest.questionId} questionId={latest.questionId} onClose={() => { setReferralOpen(false); setDismissed((d) => [...d, latest.questionId]); }} />}
          </div>

          <div className="border-t bg-background/60 px-3 pb-3 pt-2 sm:px-5">
            {(!showPanel && latest && !closed && (abstainedOpen || waiting)) || withTeacher || blocked ? (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {!showPanel && latest && !closed && (abstainedOpen || waiting) && <button className={`${btnGhost} py-1.5 text-xs`} onClick={() => setReferralOpen(true)} data-testid={`button-refer-${latest.questionId}`}>{waiting ? 'تحقق من توفر المعلمين' : 'اطلب معلماً'}</button>}
                {withTeacher && <p className="font-ui text-xs" data-testid="text-referral-state">{refStatus === 'answered' ? `أجاب ${status.data?.referral.teacherName ?? 'المعلم'}.` : `أُحيلت المحادثة إلى ${status.data?.referral.teacherName ?? 'معلم'}.`} رسائلك الآن تصل إلى المعلم دون توليد آلي. <Link href="/student/messages" className="font-bold text-secondary">الرسائل</Link></p>}
                {blocked && <p className="w-full rounded-xl bg-muted px-3 py-2 font-ui text-xs" role="status" data-testid="text-composer-blocked">{blocked}</p>}
              </div>
            ) : null}
            <div className="flex items-end gap-2 rounded-2xl border bg-card p-1.5 focus-within:ring-2 focus-within:ring-secondary">
              <textarea className="max-h-40 min-h-[2.75rem] min-w-0 flex-1 resize-none bg-transparent px-3 py-2 font-arabic text-base leading-relaxed focus:outline-none disabled:opacity-60" rows={2} maxLength={8000}
                placeholder={!sel && !bookId ? 'اختر الكتاب أولاً' : placeholder} value={text} disabled={inputDisabled} aria-label={placeholder}
                onChange={(e) => setText(e.target.value)} data-testid="input-question"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
              <button className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40" disabled={!text.trim() || inputDisabled} onClick={send} aria-label="إرسال" data-testid="button-ask"><SendHorizontal size={17} className="rtl:-scale-x-100" /></button>
            </div>
            <p className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 font-ui text-[11px] text-muted-foreground">
              <span data-testid="text-no-fatwa">{NO_FATWA}</span>
              <span className="shrink-0" data-testid="text-machine-label">{withTeacher ? 'رسائل مباشرة إلى المعلم' : 'إجابات آلية غير مراجعة'} · Shift+Enter لسطر جديد</span>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
