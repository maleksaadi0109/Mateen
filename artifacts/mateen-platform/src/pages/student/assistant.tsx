import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetMateenAssistantQuestionsQueryKey, getGetMateenAssistantReadinessQueryKey, getGetMateenConversationsQueryKey, useAskMateenAssistant, useGetMateenAssistantQuestions, useGetMateenAssistantReadiness, useReportScholarlyIssue } from '@workspace/api-client-react';
import type { AssistantQuestion } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { ShieldAlert, Sparkles } from 'lucide-react';
import { EmptyState, ErrorState, LoadingList, PageHeader } from '@/components/mateen/bits';
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

function QuestionCard({ a }: { a: AssistantQuestion }) {
  const regenerate = useAskMateenAssistant();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isLegacyExcerpt = a.model === 'reference-excerpt';
  const [referral, setReferral] = useState(false);
  const [issue, setIssue] = useState(false);
  const canRefer = (a.status === 'abstained' && a.referral.status === 'not_referred') || a.referral.status === 'waiting_for_teacher';
  return (
    <article className="paper-card p-6" data-testid={`card-question-${a.questionId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><StatusPill status={a.status} /><span className="font-ui text-xs text-muted-foreground" data-testid={`text-model-${a.questionId}`}>النموذج: {a.model}</span></div>
      <p className="mt-2 font-ui text-xs text-muted-foreground">{fmtDate(a.createdAt)}</p>
      <p className="mt-2 font-ui text-sm font-semibold" data-testid="text-question-book">الكتاب: {STUDY_BOOKS.find(book => book.id === a.textId)?.title}</p>
      <p className="mt-3 whitespace-pre-wrap font-ui text-sm font-semibold">{a.question}</p>
      {a.textContext && <p className="mt-2 whitespace-pre-wrap font-arabic text-sm text-muted-foreground">سياق الدراسة: {a.textContext}</p>}
      {isLegacyExcerpt ? <p className="mt-3 font-arabic text-lg leading-loose text-muted-foreground">هذه إجابة مرجعية سابقة. يمكنك الآن طلب شرح يولّده المساعد لسؤالك، دون عرض المقتطفات والمصادر.</p>
        : a.answer ? <p className="mt-3 whitespace-pre-wrap font-arabic text-lg leading-loose" data-testid="text-answer">{a.answer}</p>
        : <p className="mt-3 font-arabic text-lg leading-loose text-muted-foreground" data-testid="text-abstained">{a.reason || 'لم تكفِ المصادر المراجَعة للجواب، فامتنع المساعد بدل أن يخمّن.'}</p>}
      {a.referral.status !== 'not_referred' && (
        <p className="mt-3 font-ui text-sm" data-testid="text-referral-state">{a.referral.status === 'waiting_for_teacher' ? 'طلبك بانتظار معلم معتمد متاح.' : a.referral.status === 'answered' ? `أجاب ${a.referral.teacherName ?? 'المعلم'}.` : `أُحيل إلى ${a.referral.teacherName ?? 'معلم'} وبانتظار الرد.`} <Link href="/student/messages" className="font-bold text-secondary">الرسائل</Link></p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        {isLegacyExcerpt && <button className={btnPrimary} disabled={regenerate.isPending} data-testid={`button-generate-explanation-${a.questionId}`} onClick={() => regenerate.mutate({
          data: { question: a.question, textId: a.textId, textContext: a.textContext },
        }, {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: getGetMateenAssistantQuestionsQueryKey() });
            qc.invalidateQueries({ queryKey: getGetMateenConversationsQueryKey() });
          },
          onError: () => {
            toast({ title: 'تعذّر توليد الشرح الآن', description: 'أعد المحاولة؛ لم تُستبدل الإجابة القديمة أو تُحذف.', variant: 'destructive' });
            qc.invalidateQueries({ queryKey: getGetMateenAssistantQuestionsQueryKey() });
          },
        })}>{regenerate.isPending ? 'جارٍ توليد الشرح' : 'ولّد شرحاً لسؤالي'}</button>}
        {canRefer && <button className={btnPrimary} onClick={() => setReferral(true)} data-testid={`button-refer-${a.questionId}`}>{a.referral.status === 'waiting_for_teacher' ? 'تحقق من توفر المعلمين' : 'اطلب معلماً'}</button>}
        <button className={btnGhost} onClick={() => setIssue((v) => !v)} data-testid={`button-report-${a.questionId}`}><ShieldAlert size={15} />أبلغ عن مشكلة</button>
      </div>
      {referral && <ReferralPanel questionId={a.questionId} onClose={() => setReferral(false)} />}
      {issue && <IssueForm questionId={a.questionId} onDone={() => setIssue(false)} />}
    </article>
  );
}

export default function AssistantPage() {
  usePageMeta('المساعد العلمي | مَتِين', 'إجابات تعليمية آلية مع توضيح التوثيق، وإحالة إلى معلم عند الحاجة.');
  const qc = useQueryClient();
  const { toast } = useToast();
  const ready = useGetMateenAssistantReadiness({ query: { queryKey: getGetMateenAssistantReadinessQueryKey() } });
  const poll = useFinitePoll(10000);
  const hist = useGetMateenAssistantQuestions({ query: { queryKey: getGetMateenAssistantQuestionsQueryKey(), refetchInterval: poll } });
  const ask = useAskMateenAssistant();
  const [question, setQuestion] = useState('');
  const [bookId, setBookId] = useState<StudyBookId | ''>('');
  const [context, setContext] = useState('');
  const enabled = ready.data?.assistantEnabled === true;
  const canSubmit = Boolean(ready.data) && !ready.isError;
  const submit = () => {
    if (!bookId || ask.isPending) return;
    const text = question.trim();
    ask.mutate({ data: { question: text, textId: bookId, textContext: context.trim() || null } }, {
      onSuccess: () => { setQuestion(''); setContext(''); qc.invalidateQueries({ queryKey: getGetMateenAssistantQuestionsQueryKey() }); qc.invalidateQueries({ queryKey: getGetMateenConversationsQueryKey() }); },
      onError: () => { toast({ title: 'تعذّر تقديم إجابة موثقة', description: 'راجع سجل الأسئلة؛ قد حُفظ السؤال مع سبب الامتناع دون توليد جواب.', variant: 'destructive' }); hist.refetch(); ready.refetch(); },
    });
  };
  const history = hist.data ?? [];
  return (
    <div>
      <PageHeader eyebrow="المساعد العلمي" title="اختر الكتاب، ثم اسأل">اختر الكتاب واكتب سؤالك؛ يولّد المساعد شرحاً مباشراً للمعنى، مع مثال عند الحاجة، بدلاً من عرض مقتطفات المصادر. الإجابات آلية وغير مراجعة علمياً.</PageHeader>
      <p className="mb-6 rounded-2xl border border-secondary/30 bg-card p-4 font-ui text-sm" data-testid="text-no-fatwa">{NO_FATWA}</p>
      {ready.isLoading ? <LoadingList rows={1} /> : ready.isError || !ready.data ? <ErrorState message="تعذّر قراءة حالة المساعد." onRetry={() => ready.refetch()} /> : (
        <section className="paper-card mb-8 p-6" data-testid="card-readiness">
          <h2 className="font-display text-lg font-bold">جاهزية المساعد</h2>
          <ul className="mt-3 grid gap-2 font-ui text-sm sm:grid-cols-2">
            <li data-testid="text-ready-provider">المزوّد: {ready.data.providerConfigured ? 'مهيّأ' : 'غير مهيّأ'}</li>
            <li data-testid="text-ready-sources">مصادر مراجَعة: {ready.data.reviewedSourceCount.toLocaleString('ar-EG')}</li>
            <li data-testid="text-ready-eval">التقييم: {ready.data.evaluationPassed ? 'اجتاز' : 'لم يجتز بعد'}</li>
            <li data-testid="text-ready-model">النموذج: {ready.data.model}</li>
          </ul>
           {!enabled && <p className="mt-4 font-arabic text-lg leading-loose text-muted-foreground" data-testid="text-assistant-disabled">{ready.data.studyAnswersEnabled ? 'المساعد متاح لتوليد شرح لسؤالك عن الكتاب المختار. هذه الإجابات غير مراجعة علمياً.' : 'اتصال النموذج غير متاح الآن؛ أعد المحاولة لاحقاً.'}</p>}
        </section>
      )}
      <section className="paper-card mb-8 space-y-4 p-6">
        <Field label="عن أي كتاب تريد أن تسأل؟" hint="اختيار الكتاب مطلوب قبل إرسال السؤال">
          <select className={field} value={bookId} required disabled={!canSubmit || ask.isPending} data-testid="select-study-book" onChange={(e) => {
            setBookId(STUDY_BOOKS.find(book => book.id === e.target.value)?.id ?? '');
            setContext('');
          }}>
            <option value="" disabled>اختر الكتاب</option>
            {STUDY_BOOKS.map(book => <option key={book.id} value={book.id}>{book.title}</option>)}
          </select>
        </Field>
        {bookId === 'usul-thalatha' && <p className="font-ui text-sm text-muted-foreground" data-testid="text-study-book-notice">سيشرح المساعد سؤالك في سياق الأصول الثلاثة، لا الأربعين النووية.</p>}
        <Field label="سؤالك" hint="حتى ٨٠٠٠ حرف"><textarea className={`${field} font-arabic text-base`} rows={4} maxLength={8000} value={question} onChange={(e) => setQuestion(e.target.value)} disabled={!canSubmit || ask.isPending} data-testid="input-question" /></Field>
        <Field label={`سياق ${STUDY_BOOKS.find(book => book.id === bookId)?.title ?? 'الدراسة'} (اختياري)`} hint="حتى ٣٠٠٠ حرف"><textarea className={`${field} font-arabic`} rows={2} maxLength={3000} value={context} onChange={(e) => setContext(e.target.value)} disabled={!canSubmit || ask.isPending} data-testid="input-context" /></Field>
         <button className={btnPrimary} disabled={!canSubmit || !bookId || !question.trim() || ask.isPending} onClick={submit} data-testid="button-ask"><Sparkles size={15} />{ask.isPending ? 'جارٍ إعداد الإجابة' : 'اسأل'}</button>
      </section>
      <h2 className="mb-4 font-display text-xl font-bold">سجل أسئلتك</h2>
      {hist.isLoading ? <LoadingList /> : hist.isError ? <ErrorState onRetry={() => hist.refetch()} /> : !history.length ? (
         <EmptyState title="لا أسئلة بعد">حين تسأل سيُحفظ السؤال وجوابه وحالة توثيقه هنا.</EmptyState>
      ) : <div className="space-y-4">{history.map((h) => <QuestionCard key={h.questionId} a={h} />)}</div>}
    </div>
  );
}
