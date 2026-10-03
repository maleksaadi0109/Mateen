import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetMateenAssistantQuestionsQueryKey, getGetMateenAssistantReadinessQueryKey, getGetMateenConversationMessagesQueryKey, getGetMateenConversationStatusQueryKey, getGetMateenConversationsQueryKey, useAskMateenAssistant, useGetMateenAssistantQuestions, useGetMateenAssistantReadiness, useGetMateenConversationMessages, useGetMateenConversationStatus, useReportScholarlyIssue, useSendMateenFollowUp } from '@workspace/api-client-react';
import type { AssistantQuestion } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { Plus, SendHorizontal, ShieldAlert } from 'lucide-react';
import { ErrorState, LoadingList, PageHeader } from '@/components/mateen/bits';
import { ChatMessages } from '@/components/scholarly/ChatMessages';
import { Field, NO_FATWA, StatusPill, btnGhost, btnPrimary, field, useFinitePoll } from '@/components/scholarly/shared';
import { ReferralPanel } from '@/components/scholarly/ReferralPanel';
import { fmtDate, usePageMeta } from '@/lib/mateen';
import { useToast } from '@/hooks/use-toast';

const STUDY_BOOKS = [
  { id: 'nawawi', title: 'الأربعون النووية' },
  { id: 'usul-thalatha', title: 'الأصول الثلاثة' },
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

const bookTitle = (id: string) => STUDY_BOOKS.find((b) => b.id === id)?.title ?? id;

export default function AssistantPage() {
  usePageMeta('المساعد العلمي | مَتِين', 'محادثة تعليمية مع المساعد الآلي، وإحالة إلى معلم عند الحاجة.');
  const qc = useQueryClient();
  const { toast } = useToast();
  const ready = useGetMateenAssistantReadiness({ query: { queryKey: getGetMateenAssistantReadinessQueryKey() } });
  const poll = 8000;
  const hist = useGetMateenAssistantQuestions({ query: { queryKey: getGetMateenAssistantQuestionsQueryKey(), refetchInterval: poll } });
  const ask = useAskMateenAssistant();
  const follow = useSendMateenFollowUp();
  const [sel, setSel] = useState<string | null>(null); // null = new conversation
  const [bookId, setBookId] = useState<StudyBookId | ''>('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [referralOpen, setReferralOpen] = useState(false);
  const [issue, setIssue] = useState(false);
  const reqId = useRef<{ key: string; text: string; id: string }>({ key: '', text: '', id: crypto.randomUUID() });
  const pending = ask.isPending || follow.isPending;
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
  const thread = threads.find((t) => t.id === sel);
  const latest = thread?.latest;

  const msgs = useGetMateenConversationMessages(sel ?? '', { query: { enabled: !!sel, queryKey: getGetMateenConversationMessagesQueryKey(sel ?? ''), refetchInterval: sel ? poll : false } });
  const status = useGetMateenConversationStatus(sel ?? '', { query: { enabled: !!sel, queryKey: getGetMateenConversationStatusQueryKey(sel ?? ''), refetchInterval: sel ? poll : false } });
  const refStatus = status.data?.referral.status ?? latest?.referral.status ?? 'not_referred';
  const closed = status.data?.status === 'closed';
  const waiting = refStatus === 'waiting_for_teacher';
  const withTeacher = refStatus === 'awaiting_reply' || refStatus === 'answered';
  const abstainedOpen = !!latest && latest.status === 'abstained' && refStatus === 'not_referred';
  const autoPanel = abstainedOpen && !dismissed.includes(latest!.questionId);
  const showPanel = !!latest && !closed && (referralOpen || autoPanel);

  useEffect(() => { setReferralOpen(false); setIssue(false); }, [sel]);

  const refresh = (cid?: string) => {
    qc.invalidateQueries({ queryKey: getGetMateenAssistantQuestionsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetMateenConversationsQueryKey() });
    if (cid) { qc.invalidateQueries({ queryKey: getGetMateenConversationMessagesQueryKey(cid) }); qc.invalidateQueries({ queryKey: getGetMateenConversationStatusQueryKey(cid) }); }
  };
  const nextReq = (k: string, t: string) => {
    if (reqId.current.key !== k || reqId.current.text !== t) reqId.current = { key: k, text: t, id: crypto.randomUUID() };
    return reqId.current.id;
  };
  const failToast = () => toast({ title: 'تعذّر الإرسال', description: 'نصك محفوظ في الحقل؛ أعد المحاولة.', variant: 'destructive' });
  const clearDraft = (k: string) => {
    if (reqId.current.key === k) reqId.current = { key: '', text: '', id: crypto.randomUUID() };
    setDrafts((d) => { const n = { ...d }; delete n[k]; return n; });
  };

  const send = () => {
    const t = text.trim();
    if (!t || pending || waiting || closed || (sel ? !status.data : !ready.data)) return;
    if (!sel) {
      if (!bookId) return;
      ask.mutate({ data: { question: t, textId: bookId, textContext: null } }, {
        onSuccess: (a) => { clearDraft('new'); refresh(a.conversationId); setSel(a.conversationId); },
        onError: async (err) => {
          const qid = (err as { data?: { questionId?: string } } | null)?.data?.questionId;
          const res = await hist.refetch();
          const found = qid ? res.data?.find((q) => q.questionId === qid) : undefined;
          if (found) {
            clearDraft('new'); refresh(found.conversationId); setSel(found.conversationId);
            toast({ title: 'حُفظ سؤالك', description: 'تعذّر على المساعد الجواب الآن. السؤال محفوظ في المحادثة، ولم يُرسل شيء مكرراً.' });
          } else failToast();
        },
      });
    } else {
      const cid = sel;
      follow.mutate({ conversationId: cid, data: { text: t, requestId: nextReq(cid, t) } }, {
        onSuccess: () => { clearDraft(cid); refresh(cid); },
        onError: async (err) => {
          const qid = (err as { data?: { questionId?: string } } | null)?.data?.questionId;
          const res = await hist.refetch();
          if (qid && res.data?.some(q => q.questionId === qid && q.conversationId === cid)) {
            clearDraft(cid);
            toast({ title: 'حُفظت رسالتك', description: 'تعذّر على المساعد الجواب. يمكنك إحالة الحوار إلى معلم دون إعادة إرسال الرسالة.' });
          } else failToast();
          refresh(cid);
        },
      });
    }
  };

  const lockedBook = thread ? thread.first.textId : bookId;
  const placeholder = withTeacher ? 'اكتب رسالتك إلى المعلم' : 'اكتب سؤالك أو متابعتك';
  const blocked = waiting ? 'طلبك بانتظار معلم معتمد متاح. أوقف المساعد الإجابة في هذه المحادثة حتى يُسند إليها معلم.' : closed ? 'أُغلقت هذه المحادثة وهي للقراءة فقط.' : '';

  return (
    <div>
      <PageHeader eyebrow="المساعد العلمي" title="محادثتك مع المساعد">اختر الكتاب ثم اسأل، وتابع في المحادثة نفسها. الإجابات آلية وغير مراجعة علمياً.</PageHeader>
      <p className="mb-5 rounded-2xl border border-secondary/30 bg-card p-4 font-ui text-sm" data-testid="text-no-fatwa">{NO_FATWA}</p>
      {ready.isError && <div className="mb-5"><ErrorState message="تعذّر قراءة حالة المساعد." onRetry={() => ready.refetch()} /></div>}
      <div className="grid gap-5 md:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-3" data-testid="list-conversations">
          <button className={`${btnPrimary} w-full`} disabled={pending} onClick={() => setSel(null)} data-testid="button-new-conversation"><Plus size={15} />محادثة جديدة</button>
          {hist.isLoading ? <LoadingList rows={3} /> : hist.isError ? <ErrorState onRetry={() => hist.refetch()} /> : !threads.length ? (
            <p className="rounded-2xl border border-dashed p-4 font-ui text-sm text-muted-foreground" data-testid="text-no-conversations">لا محادثات محفوظة بعد. تُحفظ محادثاتك هنا تلقائياً.</p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto md:max-h-[60vh]">
              {threads.map((t) => (
                <li key={t.id}>
                  <button disabled={pending && t.id !== sel} onClick={() => setSel(t.id)} data-testid={`button-thread-${t.id}`}
                    className={`block w-full min-w-0 rounded-2xl border p-3 text-start disabled:opacity-50 ${t.id === sel ? 'border-secondary bg-card' : 'hover:bg-muted'}`}>
                    <span className="block truncate font-arabic text-base">{t.first.question}</span>
                    <span className="mt-1 flex items-center justify-between gap-2 font-ui text-xs text-muted-foreground"><span className="truncate">{bookTitle(t.first.textId)}</span><span>{fmtDate(t.latest.createdAt)}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="paper-card flex min-w-0 flex-col p-4 sm:p-6" data-testid="card-chat">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            {sel ? <div className="flex flex-wrap items-center gap-2"><span className="font-ui text-sm font-bold" data-testid="text-question-book">الكتاب: {bookTitle(lockedBook)}</span>{refStatus !== 'not_referred' && <StatusPill status={refStatus} />}</div>
              : <Field label="عن أي كتاب تريد أن تسأل؟" hint="يُثبَّت الكتاب في المحادثة بعد أول سؤال">
                <select className={field} value={bookId} disabled={pending} data-testid="select-study-book" onChange={(e) => setBookId(STUDY_BOOKS.find((b) => b.id === e.target.value)?.id ?? '')}>
                  <option value="" disabled>اختر الكتاب</option>
                  {STUDY_BOOKS.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
                </select></Field>}
            {latest && <button className={btnGhost} onClick={() => setIssue((v) => !v)} data-testid={`button-report-${latest.questionId}`}><ShieldAlert size={15} />أبلغ عن مشكلة</button>}
          </div>
          {issue && latest && <IssueForm questionId={latest.questionId} onDone={() => setIssue(false)} />}

          <div className="min-h-[14rem] flex-1 space-y-3 md:max-h-[55vh] md:overflow-y-auto">
            {!sel ? <p className="py-10 text-center font-arabic text-lg leading-loose text-muted-foreground" data-testid="text-chat-empty">{bookId === 'usul-thalatha' ? 'سيشرح المساعد سؤالك في سياق الأصول الثلاثة.' : bookId ? 'اكتب سؤالك عن الأربعين النووية لتبدأ المحادثة.' : 'اختر الكتاب أولاً، ثم اكتب سؤالك.'}</p>
              : msgs.isLoading ? <LoadingList rows={2} /> : msgs.isError ? <ErrorState onRetry={() => msgs.refetch()} /> : <ChatMessages messages={msgs.data ?? []} viewer="student" />}
             {pending && <p className="font-ui text-sm text-muted-foreground" data-testid="text-pending">جارٍ المعالجة...</p>}
             {sel && status.isError && <ErrorState message="تعذّر التحقق من حالة المحادثة؛ لم تُرسل رسالة جديدة." onRetry={() => status.refetch()} />}
          </div>

          {showPanel && latest && <ReferralPanel key={latest.questionId} questionId={latest.questionId} onClose={() => { setReferralOpen(false); setDismissed((d) => [...d, latest.questionId]); }} />}
          {!showPanel && latest && !closed && (abstainedOpen || waiting) && <button className={`${btnGhost} mt-3 self-start`} onClick={() => setReferralOpen(true)} data-testid={`button-refer-${latest.questionId}`}>{waiting ? 'تحقق من توفر المعلمين' : 'اطلب معلماً'}</button>}
          {withTeacher && <p className="mt-3 font-ui text-sm" data-testid="text-referral-state">{refStatus === 'answered' ? `أجاب ${status.data?.referral.teacherName ?? 'المعلم'}.` : `أُحيلت المحادثة إلى ${status.data?.referral.teacherName ?? 'معلم'}.`} رسائلك الآن تصل إلى المعلم دون توليد آلي. <Link href="/student/messages" className="font-bold text-secondary">الرسائل</Link></p>}
          {blocked && <p className="mt-3 rounded-xl bg-muted p-3 font-ui text-sm" role="status" data-testid="text-composer-blocked">{blocked}</p>}

          <div className="mt-4 flex items-end gap-2">
             <textarea className={`${field} min-w-0 flex-1 font-arabic text-base`} rows={2} maxLength={8000} placeholder={placeholder} value={text} disabled={pending || !!blocked || (sel ? !status.data : !bookId || !ready.data)}
              onChange={(e) => setText(e.target.value)} data-testid="input-question"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
             <button className={btnPrimary} disabled={!text.trim() || pending || !!blocked || (sel ? !status.data : !bookId || !ready.data)} onClick={send} aria-label="إرسال" data-testid="button-ask"><SendHorizontal size={16} className="rtl:-scale-x-100" /></button>
          </div>
        </section>
      </div>
    </div>
  );
}
