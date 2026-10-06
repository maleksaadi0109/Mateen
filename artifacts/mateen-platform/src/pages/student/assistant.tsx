import { fmt } from '@/lib/i18n';
import { tr } from '@/lib/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { askMateenAssistant, sendMateenFollowUp, getGetMateenAssistantQuestionsQueryKey, getGetMateenAssistantReadinessQueryKey, getGetMateenConversationMessagesQueryKey, getGetMateenConversationStatusQueryKey, getGetMateenConversationsQueryKey, useAskMateenAssistant, useGetMateenAssistantQuestions, useGetMateenAssistantReadiness, useGetMateenConversationMessages, useGetMateenConversationStatus, useReportScholarlyIssue, useSendMateenFollowUp } from '@workspace/api-client-react';
import type { AssistantQuestion } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { BookOpen, History, MessagesSquare, Plus, Search, SendHorizontal, ShieldAlert, X } from 'lucide-react';
import { ErrorState, LoadingList } from '@/components/mateen/bits';
import { ChatMessages } from '@/components/scholarly/ChatMessages';
import { AnswerModeControl } from '@/components/scholarly/AnswerModeControl';
import { Field, noFatwa, StatusPill, btnGhost, btnPrimary, field } from '@/components/scholarly/shared';
import { ReferralPanel } from '@/components/scholarly/ReferralPanel';
import { fmtDate, usePageMeta } from '@/lib/mateen';
import { useToast } from '@/hooks/use-toast';
import { boundedChatRequest } from '@/lib/chat-request';

const STUDY_BOOKS = [
  { id: 'nawawi', get title() { return tr("الأربعون النووية"); } },
  { id: 'usul-thalatha', get title() { return tr("الأصول الثلاثة"); } },
  { id: 'tuhfa', get title() { return tr("تحفة الأطفال"); } },
] as const;
type StudyBookId = (typeof STUDY_BOOKS)[number]['id'];
// Retain titles for historical conversations, but new AI questions are hadith-only.
const ASSISTANT_BOOKS = STUDY_BOOKS.filter(b => b.id === 'nawawi');

function IssueForm({ questionId, onDone }: { questionId: string; onDone: () => void }) {
  const [category, setCategory] = useState<'citation' | 'unsupported_claim' | 'safety' | 'other'>('citation');
  const [description, setDescription] = useState('');
  const m = useReportScholarlyIssue();
  const { toast } = useToast();
  return (
    <div className="mt-4 space-y-3 rounded-2xl border bg-background p-4" data-testid="form-issue">
      <Field label={tr("نوع المشكلة")}>
        <select className={field} value={category} onChange={(e) => setCategory(e.target.value as typeof category)} data-testid="select-issue-category">
          <option value="citation">{tr("اقتباس أو إحالة خاطئة")}</option><option value="unsupported_claim">{tr("ادعاء بلا سند")}</option><option value="safety">{tr("مسألة سلامة")}</option><option value="other">{tr("أخرى")}</option>
        </select>
      </Field>
      <Field label={tr("الوصف")}><textarea className={field} rows={3} minLength={3} maxLength={3000} value={description} onChange={(e) => setDescription(e.target.value)} data-testid="input-issue-description" /></Field>
      <button className={btnPrimary} disabled={description.trim().length < 3 || m.isPending} data-testid="button-submit-issue"
        onClick={() => m.mutate({ data: { questionId, category, description: description.trim() } }, { onSuccess: () => { toast({ title: tr("وصل بلاغك إلى المراجعين") }); onDone(); }, onError: () => toast({ title: tr("تعذّر إرسال البلاغ"), variant: 'destructive' }) })}>{tr("إرسال البلاغ")}</button>
    </div>
  );
}

// i18n-keys: starter prompts, localised through tr() when shown and inserted
const STARTERS = ['عرّفني بالمتن وموضوعاته الأساسية', 'اقترح لي طريقة لمذاكرة هذا المتن', 'ما الذي ينبغي فهمه قبل دراسة هذا المتن؟'];
const bookTitle = (id: string) => STUDY_BOOKS.find((b) => b.id === id)?.title ?? id;

export default function AssistantPage() {
  usePageMeta(tr("المساعد العلمي | مَتِين"), tr("محادثة تعليمية مع المساعد الآلي، وإحالة إلى معلم عند الحاجة."));
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
  const [modes, setModes] = useState<Record<string, 'study' | 'sources'>>({});
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
  const answerMode = modes[key] ?? (latest?.answerMode === 'sources' ? 'sources' : 'study');

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
      ? tr("تأخر اتصال المساعد وانتهت مهلة الانتظار. نصك محفوظ؛ راجع المحادثات المحفوظة قبل إعادة الإرسال، فقد يكون الطلب وصل للخادم.")
      : tr("تعذّر الحصول على الرد. نصك محفوظ في الحقل؛ يمكنك إعادة المحاولة.");
    setSendError(description);
    toast({ title: timedOut ? tr("انتهت مهلة انتظار الرد") : tr("تعذّر الإرسال"), description, variant: 'destructive' });
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
      ask.mutate({ data: { question: t, textId: bookId, textContext: null, answerMode } }, {
        onSuccess: (a) => { clearDraft('new'); refresh(a.conversationId); setSel(a.conversationId); },
        onError: async (err) => {
          const qid = (err as { data?: { questionId?: string } } | null)?.data?.questionId;
           const res = qid ? await boundedChatRequest(() => hist.refetch(), 5000).catch(() => null) : null;
           const found = qid ? res?.data?.find((q) => q.questionId === qid) : undefined;
          if (found) {
            clearDraft('new'); refresh(found.conversationId); setSel(found.conversationId);
            toast({ title: tr("حُفظ سؤالك"), description: tr("تعذّر على المساعد الجواب الآن. السؤال محفوظ في المحادثة، ولم يُرسل شيء مكرراً.") });
           } else failToast(err);
        },
      });
    } else {
      const cid = sel;
      follow.mutate({ conversationId: cid, data: { text: t, requestId: nextReq(cid, `${answerMode}:${t}`), ...(!withTeacher ? { answerMode } : {}) } }, {
        onSuccess: () => { clearDraft(cid); refresh(cid); },
        onError: async (err) => {
          const qid = (err as { data?: { questionId?: string } } | null)?.data?.questionId;
           const res = qid ? await boundedChatRequest(() => hist.refetch(), 5000).catch(() => null) : null;
           if (qid && res?.data?.some(q => q.questionId === qid && q.conversationId === cid)) {
            clearDraft(cid);
            toast({ title: tr("حُفظت رسالتك"), description: tr("تعذّر على المساعد الجواب. يمكنك إحالة الحوار إلى معلم دون إعادة إرسال الرسالة.") });
           } else failToast(err);
          refresh(cid);
        },
      });
    }
  };

  const lockedBook = thread ? thread.first.textId : bookId;
  const placeholder = withTeacher ? tr("اكتب رسالتك إلى المعلم") : tr("اكتب سؤالك أو متابعتك");
  const blocked = waiting ? tr("طلبك بانتظار معلم معتمد متاح. أوقف المساعد الإجابة في هذه المحادثة حتى يُسند إليها معلم.") : closed ? tr("أُغلقت هذه المحادثة وهي للقراءة فقط.") : '';

  const inputDisabled = pending || !!blocked || !canCompose;
  const historyList = (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <label className="relative block">
        <Search size={15} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-muted-foreground" />
        <input type="search" maxLength={200} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr("ابحث في محادثاتك")} aria-label={tr("ابحث في المحادثات")}
          className="w-full rounded-full border bg-background py-2 pe-3 ps-9 font-ui text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary" data-testid="input-search-conversations" />
      </label>
      {hist.isLoading ? <LoadingList rows={4} /> : hist.isError ? <ErrorState onRetry={() => hist.refetch()} /> : !threads.length ? (
        <div className="rounded-2xl border border-dashed p-5 text-center font-ui text-sm text-muted-foreground" data-testid="text-no-conversations">
          <MessagesSquare size={22} className="mx-auto mb-2 text-secondary" />{tr("لا محادثات محفوظة بعد. تُحفظ محادثاتك هنا تلقائياً.")}</div>
      ) : !filtered.length ? (
        <div className="rounded-2xl border border-dashed p-5 text-center font-ui text-sm text-muted-foreground" data-testid="text-no-search-results">{tr("لا نتائج تطابق «")}{query.trim()}».
          <button className="mt-2 block w-full font-bold text-secondary" onClick={() => setQuery('')} data-testid="button-clear-search">{tr("امسح البحث")}</button>
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
                  <span className="mt-1 block space-y-1 font-ui text-xs leading-relaxed text-muted-foreground">
                    <span className="block truncate">{bookTitle(t.first.textId)}</span><span className="block">{fmtDate(t.latest.createdAt)}</span>
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
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-5 sm:gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-ui text-xs font-bold tracking-wide text-secondary">{tr("المساعد العلمي")}</p>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{tr("مجلس السؤال")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className={`${btnGhost} xl:hidden`} onClick={() => setHistOpen((v) => !v)} aria-expanded={histOpen} data-testid="button-toggle-history"><History size={15} />{tr("المحادثات")}{threads.length ? ` (${threads.length})` : ''}</button>
          <button className={btnPrimary} disabled={pending} onClick={() => { setSel(null); setHistOpen(false); }} data-testid="button-new-conversation"><Plus size={15} />{tr("محادثة جديدة")}</button>
        </div>
      </header>
      {ready.isError && <ErrorState message={tr("تعذّر قراءة حالة المساعد؛ الإرسال موقوف حتى تنجح القراءة.")} onRetry={() => ready.refetch()} />}

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[14rem_minmax(0,1fr)] xl:gap-6">
        <aside className={`${histOpen ? 'flex' : 'hidden'} max-h-[50dvh] min-w-0 flex-col rounded-3xl border bg-muted/40 p-4 xl:sticky xl:top-[calc(var(--mateen-assistant-height)+1.5rem)] xl:flex xl:max-h-[calc(100dvh-var(--mateen-assistant-height)-3rem)]`} data-testid="list-conversations">
          <p className="mb-3 px-1 font-ui text-sm font-bold text-muted-foreground">{tr("المحادثات المحفوظة")}</p>
          {historyList}
        </aside>

        <section className="paper-card flex min-w-0 flex-col overflow-hidden p-0" data-testid="card-chat">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-card/50 px-5 py-4 sm:px-7">
            {sel ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <BookOpen size={16} className="text-secondary" />
                <span className="font-ui text-sm font-bold" data-testid="text-question-book">{tr("الكتاب:")}{' '}{bookTitle(lockedBook)}</span>
                {refStatus !== 'not_referred' && <StatusPill status={refStatus} />}
              </div>
            ) : (
              <label className="flex min-w-0 flex-wrap items-center gap-2 font-ui text-sm font-bold">
                <BookOpen size={16} className="text-secondary" />{tr("الكتاب")}<select className="rounded-full border bg-card px-3 py-1.5 font-ui text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary" value={bookId} disabled={pending} data-testid="select-study-book"
                  onChange={(e) => setBookId(STUDY_BOOKS.find((b) => b.id === e.target.value)?.id ?? '')}>
                  <option value="" disabled>{tr("اختر الكتاب")}</option>
                  {ASSISTANT_BOOKS.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
                </select>
              </label>
            )}
            {latest && <button className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-ui text-xs font-semibold text-muted-foreground hover:bg-muted" onClick={() => setIssue((v) => !v)} aria-expanded={issue} data-testid={`button-report-${latest.questionId}`}>{issue ? <X size={14} /> : <ShieldAlert size={14} />}{tr("أبلغ عن مشكلة")}</button>}
          </div>

          {/* Let the page grow with its content: a fixed-height flex panel was
              clipping the introduction and referral behind the composer. */}
          <div className="min-h-[18rem] min-w-0 px-5 py-6 sm:px-7 sm:py-8" data-testid="chat-content">
            {issue && latest && <div className="mb-4"><IssueForm questionId={latest.questionId} onDone={() => setIssue(false)} /></div>}
            {!sel ? (
              <div className="mx-auto flex max-w-lg flex-col items-center py-2 text-center sm:py-4" data-testid="text-chat-empty">
                <span className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-secondary/10 text-secondary"><BookOpen size={26} /></span>
                <p className="font-display text-xl font-bold leading-relaxed sm:text-2xl">{bookId ? fmt("اسأل عن {a}", "Ask about {a}", { a: bookTitle(bookId) }) : tr("ابدأ باختيار الكتاب")}</p>
                <p className="mt-3 font-arabic text-base leading-8 text-muted-foreground">{bookId ? tr("اكتب سؤالك أو اختر أحد المقترحات أدناه. يمكنك متابعة الحديث في المحادثة نفسها.") : tr("اختر الأربعين النووية لبدء محادثة حول أحاديثها. يُثبَّت الكتاب بعد أول سؤال.")}</p>
                <p className="mt-5 w-full rounded-2xl border border-secondary/15 bg-secondary/5 px-4 py-3 font-ui text-sm leading-7 text-muted-foreground" data-testid="text-hadith-scope">{tr("أنا نموذج لغوي، وأجيب هنا عن المواضيع المتعلقة بالحديث فقط. إذا تعذّر عليّ الجواب، يمكنك طلب إحالة إلى شيخ متاح.")}</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2" role="group" aria-label={tr("اختر الكتاب")}>
                  {ASSISTANT_BOOKS.map((b) => (
                    <button key={b.id} disabled={pending} onClick={() => setBookId(b.id)} aria-pressed={bookId === b.id} data-testid={`button-book-${b.id}`}
                      className={`rounded-full border px-4 py-2 font-arabic text-sm transition-colors disabled:opacity-50 ${bookId === b.id ? 'border-secondary bg-secondary text-secondary-foreground' : 'bg-card hover:border-secondary/60'}`}>{b.title}</button>
                  ))}
                </div>
                {bookId && (
                  <div className="mt-6 w-full space-y-2">
                    <p className="mb-3 font-ui text-xs leading-6 text-muted-foreground">{tr("مقترحات تملأ الحقل فقط، ولا تُرسل تلقائياً")}</p>
                    {STARTERS.map((s, i) => (
                      <button key={s} disabled={inputDisabled} onClick={() => setText(tr(s))} data-testid={`button-starter-${i}`}
                        className="block w-full rounded-xl border bg-card px-4 py-3 text-start font-arabic text-sm leading-7 transition-colors hover:border-secondary/60 hover:bg-secondary/5 disabled:opacity-50">{tr(s)}</button>
                    ))}
                  </div>
                )}
              </div>
            ) : msgs.isLoading ? <LoadingList rows={3} /> : msgs.isError ? <ErrorState onRetry={() => msgs.refetch()} /> : <ChatMessages messages={msgs.data ?? []} viewer="student" />}
            {pending && (
              <div className="mt-3 flex items-center gap-3 rounded-2xl border bg-background px-4 py-3 font-ui text-sm text-muted-foreground" role="status" data-testid="text-pending">
                <span className="flex gap-1" aria-hidden="true">{[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-secondary" style={{ animationDelay: `${i * 150}ms` }} />)}</span>
                {slowPending ? tr("تأخر اتصال النموذج. الانتظار محدود؛ ستظهر الإجابة أو رسالة توضّح تعذّر الرد.") : tr("المساعد يجهّز الرد...")}
              </div>
            )}
            {!pending && sendError && <p className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 font-ui text-sm text-destructive" role="alert" data-testid="text-send-error">{sendError}</p>}
            {sel && status.isError && <div className="mt-3"><ErrorState message={tr("تعذّر التحقق من حالة المحادثة؛ لم تُرسل رسالة جديدة.")} onRetry={() => status.refetch()} /></div>}
            {showPanel && latest && <ReferralPanel key={latest.questionId} questionId={latest.questionId} onClose={() => { setReferralOpen(false); setDismissed((d) => [...d, latest.questionId]); }} />}
          </div>

          <div className="shrink-0 space-y-4 border-t bg-muted/20 p-4 sm:p-6" data-testid="chat-composer">
            {!withTeacher && !blocked && <AnswerModeControl value={answerMode}
              onChange={mode => setModes(previous => ({ ...previous, [key]: mode }))} disabled={pending}
              sourceBlockers={ready.data?.sourceBlockers ?? []}
              covered={!!lockedBook && !!ready.data?.sourceBooks?.includes(lockedBook as StudyBookId)} />}
            {(!showPanel && latest && !closed && (abstainedOpen || waiting)) || withTeacher || blocked ? (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {!showPanel && latest && !closed && (abstainedOpen || waiting) && <button className={`${btnGhost} py-1.5 text-xs`} onClick={() => setReferralOpen(true)} data-testid={`button-refer-${latest.questionId}`}>{waiting ? tr("تحقق من توفر المعلمين") : tr("اطلب معلماً")}</button>}
                {withTeacher && <p className="font-ui text-xs" data-testid="text-referral-state">{refStatus === 'answered' ? fmt("أجاب {a}.", "{a} answered.", { a: status.data?.referral.teacherName ?? tr("المعلم") }) : fmt("أُحيلت المحادثة إلى {a}.", "The conversation was referred to {a}.", { a: status.data?.referral.teacherName ?? tr("معلم") })}{' '}{tr("رسائلك الآن تصل إلى المعلم دون توليد آلي.")}{' '}<Link href="/student/messages" className="font-bold text-secondary">{tr("الرسائل")}</Link></p>}
                {blocked && <p className="w-full rounded-xl bg-muted px-3 py-2 font-ui text-xs" role="status" data-testid="text-composer-blocked">{blocked}</p>}
              </div>
            ) : null}
            <div className="flex items-end gap-3 rounded-2xl border bg-card p-2.5 focus-within:ring-2 focus-within:ring-secondary">
              <textarea className="max-h-40 min-h-[4.5rem] min-w-0 flex-1 resize-none bg-transparent px-2 py-2 font-arabic text-base leading-7 focus:outline-none disabled:opacity-60" rows={2} maxLength={8000}
                placeholder={!sel && !bookId ? tr("اختر الكتاب أولاً") : placeholder} value={text} disabled={inputDisabled} aria-label={placeholder}
                onChange={(e) => setText(e.target.value)} data-testid="input-question"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
              <button className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40" disabled={!text.trim() || inputDisabled} onClick={send} aria-label={tr("إرسال")} data-testid="button-ask"><SendHorizontal size={17} className="rtl:-scale-x-100" /></button>
            </div>
            <p className="flex flex-col gap-2 px-1 font-ui text-xs leading-6 text-muted-foreground">
              <span data-testid="text-no-fatwa">{noFatwa()}</span>
              <span data-testid="text-machine-label">{withTeacher ? tr("رسائل مباشرة إلى المعلم") : answerMode === 'sources' ? tr("بحث واقتباس آلي من المصادر") : tr("إجابات آلية غير مراجعة")}{' '}{tr("· Shift+Enter لسطر جديد")}</span>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
