import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { MessageSquareText, SendHorizontal, ChevronDown } from 'lucide-react';
import {
  askMateenAssistant, sendMateenFollowUp, getMateenAssistantQuestions,
  getGetMateenAssistantQuestionsQueryKey, getGetMateenConversationMessagesQueryKey, getGetMateenConversationStatusQueryKey,
  useGetMateenConversationMessages, useGetMateenConversationStatus,
} from '@workspace/api-client-react';
import { ChatMessages } from '@/components/scholarly/ChatMessages';
import { NO_FATWA, btnPrimary, field } from '@/components/scholarly/shared';
import { ErrorState, LoadingList } from '@/components/mateen/bits';
import { boundedChatRequest } from '@/lib/chat-request';
import { num } from '@/lib/mateen';

type Props = {
  unit?: 'البيت' | 'الباب' | 'الحديث';
  textId?: 'nawawi' | 'tuhfa';
  hadith: { number: number; title: string; text: string };
  selectedWord: string | null;
  wordRequest: number; // explicit request to compose a question about the selected passage
  onBusyChange?: (busy: boolean) => void;
  conversationId: string | null;
  onConversationId: (id: string) => void;
  draft: string;
  onDraft: (v: string) => void;
};

const errText = (e: unknown) => e instanceof Error && ['TimeoutError', 'AbortError'].includes(e.name)
  ? 'انتهت مهلة انتظار المساعد. قد يكون الطلب وصل؛ راجع المحادثة في صفحة المساعد قبل الإعادة.'
  : 'تعذّر الحصول على الرد من المساعد. يمكنك إعادة المحاولة.';

export default function StageAssistant({ hadith, selectedWord, wordRequest, onBusyChange, conversationId: cid, onConversationId, draft, onDraft, textId = 'nawawi', unit: requestedUnit }: Props) {
  const unit = requestedUnit ?? (textId === 'tuhfa' ? 'البيت' : 'الحديث');
  const bookTitle = textId === 'tuhfa' ? 'تحفة الأطفال' : 'الأربعين النووية';
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastFailed, setLastFailed] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const alive = useRef(true);
  const panel = useRef<HTMLElement>(null);
  const busyRef = useRef(false);
  const cidRef = useRef<string | null>(null);
  cidRef.current = cid;
  const onBusyRef = useRef(onBusyChange);
  onBusyRef.current = onBusyChange;
  useEffect(() => { alive.current = true; return () => { alive.current = false; onBusyRef.current?.(false); }; }, []);
  const seenWordReq = useRef(wordRequest);
  const reqId = useRef<{ cid: string; text: string; id: string } | null>(null);
  useEffect(() => { onBusyRef.current?.(busy); }, [busy]);

  const msgs = useGetMateenConversationMessages(cid ?? '', { query: { enabled: !!cid, queryKey: getGetMateenConversationMessagesQueryKey(cid ?? '') } });
  const status = useGetMateenConversationStatus(cid ?? '', { query: { enabled: !!cid, queryKey: getGetMateenConversationStatusQueryKey(cid ?? ''), refetchInterval: cid ? 15000 : false } });
  const ref = status.data?.referral.status ?? 'not_referred';
  const referred = ref !== 'not_referred';
  const closed = status.data?.status === 'closed';
  const statusUnknown = !!cid && (!status.data || status.isError);
  const blocked = referred || closed || statusUnknown;
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;

  const context = hadith.text.slice(0, 3000);
  const send = async (text: string): Promise<boolean> => {
    if (busyRef.current || blockedRef.current || !text.trim()) return false;
    busyRef.current = true; setBusy(true); setError(''); setOpen(true);
    try {
      const c = cidRef.current;
      if (!c) {
        const a = await boundedChatRequest((signal) => askMateenAssistant({ question: text, textId, textContext: context }, { signal }));
        if (!alive.current) return true;
        onConversationId(a.conversationId);
        qc.invalidateQueries({ queryKey: getGetMateenConversationMessagesQueryKey(a.conversationId) });
      } else {
        if (!reqId.current || reqId.current.cid !== c || reqId.current.text !== text) reqId.current = { cid: c, text, id: crypto.randomUUID() };
        const requestId = reqId.current.id;
        await boundedChatRequest((signal) => sendMateenFollowUp(c, { text, requestId }, { signal }));
        reqId.current = null;
        if (!alive.current) return true;
        qc.invalidateQueries({ queryKey: getGetMateenConversationMessagesQueryKey(c) });
        qc.invalidateQueries({ queryKey: getGetMateenConversationStatusQueryKey(c) });
      }
      qc.invalidateQueries({ queryKey: getGetMateenAssistantQuestionsQueryKey() });
      setLastFailed(null);
      return true;
    } catch (e) {
      const questionId = (e as { data?: { questionId?: string } } | null)?.data?.questionId;
      // The server may have saved the question even when generation failed.
      // Recover that owned thread rather than creating another conversation.
      const saved = questionId ? await boundedChatRequest(signal => getMateenAssistantQuestions({ signal }), 5000).catch(() => null) : null;
      if (alive.current) {
        const found = saved?.find(q => q.questionId === questionId);
        if (found) {
          onConversationId(found.conversationId);
          void qc.invalidateQueries({ queryKey: getGetMateenConversationMessagesQueryKey(found.conversationId) });
          void qc.invalidateQueries({ queryKey: getGetMateenAssistantQuestionsQueryKey() });
        }
        setError(found ? 'حُفظ سؤالك في المحادثة، لكن تعذّر توليد الإجابة الآن. يمكنك إعادة المحاولة أو فتح المحادثة للإحالة إلى معلم.' : errText(e));
        setLastFailed(text);
      }
      return false;
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  };
  useEffect(() => {
    if (wordRequest === seenWordReq.current) return;
    seenWordReq.current = wordRequest;
    if (selectedWord) {
      setOpen(true);
      if (!draft.trim()) onDraft(`اشرح لي هذا المقطع في سياق ${unit}.`);
      if (window.matchMedia('(max-width: 1023px)').matches) {
        panel.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      }
      requestAnimationFrame(() => panel.current?.querySelector('textarea')?.focus({ preventScroll: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordRequest]);

  const submit = async () => {
    const question = draft.trim();
    if (!question) return;
    const t = selectedWord
      ? `عن المقطع «${selectedWord}» من ${unit} رقم ${hadith.number} (${hadith.title}) في ${bookTitle}:\n${question}`
      : question;
    if (t.length > 8000) { setError('السؤال مع المقطع طويل؛ اختصر السؤال أو المقطع قبل الإرسال.'); return; }
    if (await send(t) && alive.current) onDraft('');
  };

  return (
    <section ref={panel} className="paper-card flex min-w-0 scroll-mt-20 flex-col p-4 lg:sticky lg:top-[calc(var(--mateen-assistant-height)+1.5rem)] lg:max-h-[calc(100dvh-var(--mateen-assistant-height)-3rem)]" aria-label="المساعد السياقي" data-testid="panel-stage-assistant">
      <button className="flex w-full items-center justify-between gap-2 border-b pb-3 text-start lg:cursor-default" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="button-toggle-assistant">
        <span className="flex items-center gap-2 font-display font-bold"><MessageSquareText size={18} className="text-secondary" />مساعد {unit} {num(hadith.number)}</span>
        <ChevronDown size={18} className={`transition-transform lg:hidden ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`${open ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col lg:flex`}>
        <p className="mt-3 rounded-xl bg-muted/60 p-3 font-ui text-xs leading-relaxed text-muted-foreground" data-testid="text-assistant-notice">{NO_FATWA} الإجابات آلية وغير مراجعة علميًا وقد تخطئ؛ يُرسل نص {unit} للسياق، ولا يُعدّ الشرح اعتمادًا علميًا.</p>
        <div className="mt-3 min-h-[10rem] flex-1 space-y-3 overflow-y-auto lg:max-h-[50vh]" aria-live="polite">
          {!cid && !busy && !error && <p className="py-8 text-center font-arabic text-lg leading-loose text-muted-foreground" data-testid="text-assistant-empty">حدّد مقطعًا من النص ثم اضغط «اسأل عن المقطع»، أو اكتب سؤالك عن هذا {unit}.</p>}
          {cid && (msgs.isLoading ? <LoadingList rows={2} /> : msgs.isError ? <ErrorState onRetry={() => msgs.refetch()} /> : <ChatMessages messages={msgs.data ?? []} viewer="student" />)}
          {busy && <p role="status" className="flex items-center gap-2 font-ui text-sm text-secondary" data-testid="status-assistant-busy"><span className="skel inline-block h-2 w-10" />{selectedWord ? `يُجهَّز الرد عن «${selectedWord}»...` : 'يُجهَّز الرد...'}</p>}
          {!busy && error && <div role="alert" className="rounded-xl border border-destructive/40 p-3 font-ui text-sm text-destructive" data-testid="text-assistant-error">{error}
            {lastFailed && <button className="ms-2 font-bold underline" onClick={() => void send(lastFailed)} data-testid="button-assistant-retry">إعادة المحاولة</button>}</div>}
          {cid && status.isError && <ErrorState message="تعذّر التحقق من حالة المحادثة؛ لن تُرسل رسائل حتى يتم التحقق." onRetry={() => status.refetch()} />}
        </div>
        {(referred || closed) && <p className="mt-3 rounded-xl bg-muted p-3 font-ui text-sm" role="status" data-testid="text-assistant-referred">
          {closed ? 'أُغلقت هذه المحادثة.' : 'أُحيلت هذه المحادثة إلى معلم؛ توقف التوليد الآلي فيها.'} تابعها من <Link href="/student/assistant" className="font-bold text-secondary">صفحة المساعد</Link>.</p>}
        {selectedWord && <blockquote className="mt-3 max-h-32 overflow-y-auto rounded-xl bg-secondary/10 p-3 font-arabic text-sm break-words" data-testid="assistant-selected-passage"><span className="block font-ui text-xs font-bold">سيُرفق هذا المقطع مع سؤالك:</span>{selectedWord}</blockquote>}
        <div className="mt-3 flex items-end gap-2">
          <textarea className={`${field} min-w-0 flex-1 font-arabic text-base`} rows={2} maxLength={8000} value={draft} disabled={busy || blocked}
            placeholder={`اسأل عن هذا ${unit}`} onChange={(e) => onDraft(e.target.value)} aria-label={`سؤالك عن هذا ${unit}`} data-testid="input-stage-question"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); } }} />
          <button className={btnPrimary} disabled={busy || blocked || !draft.trim()} onClick={() => void submit()} aria-label="إرسال" data-testid="button-stage-ask"><SendHorizontal size={16} className="rtl:-scale-x-100" /></button>
        </div>
        <Link href="/student/assistant" className="mt-3 self-start font-ui text-xs font-bold text-secondary hover:underline" data-testid="link-full-assistant">كل المحادثات والإحالة إلى معلم</Link>
      </div>
    </section>
  );
}
