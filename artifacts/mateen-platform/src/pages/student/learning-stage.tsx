import { useMemo, useState } from 'react';
import { Link, useParams } from 'wouter';
import { useUser } from '@clerk/react';
import { getGetStudyTextQueryKey, useGetStudyText } from '@workspace/api-client-react';
import { ArrowRight, Lock, Mic, GraduationCap, ChevronRight, ChevronLeft } from 'lucide-react';
import { EmptyState, ErrorState, SkeletonBlock } from '@/components/mateen/bits';
import { num, usePageMeta } from '@/lib/mateen';
import { recitationWords } from '@/lib/live-recitation';
import RecitationBook from '@/components/mateen/recitation-book';
import StageAssistant from '@/components/mateen/stage-assistant';
import StageExam from '@/components/mateen/stage-exam';
import { useNawawiMap } from './learning-map';

type Mode = 'study' | 'practice' | 'exam';

export default function LearningStagePage() {
  const { textId, stageNumber } = useParams<{ textId: string; stageNumber: string }>();
  const n = Number(stageNumber);
  usePageMeta(`المرحلة ${num(n || 0)} | مَتِين`, 'ادرس الحديث كلمة كلمة مع المساعد، ثم تدرّب وامتحن.');
  const { user } = useUser();
  const map = useNawawiMap();
  const text = useGetStudyText('nawawi', { query: { queryKey: getGetStudyTextQueryKey('nawawi') } });
  const [mode, setMode] = useState<Mode>('study');
  const [word, setWord] = useState<string | null>(null);
  const [req, setReq] = useState(0);
  const [busy, setBusy] = useState(false);
  const chatKey = `${user?.id ?? 'guest'}:${n}`;
  const [chats, setChats] = useState<Record<string, { cid: string | null; draft: string }>>({});
  const chat = chats[chatKey] ?? { cid: null, draft: '' };
  const patchChat = (p: Partial<{ cid: string | null; draft: string }>) => setChats((c) => ({ ...c, [chatKey]: { ...(c[chatKey] ?? { cid: null, draft: '' }), ...p } }));
  const [modeKey, setModeKey] = useState(chatKey);
  if (modeKey !== chatKey) { setModeKey(chatKey); setMode('study'); setWord(null); setBusy(false); }

  const hadith = text.data?.hadiths.find((h) => h.number === n);
  const words = useMemo(() => recitationWords(hadith?.text ?? ''), [hadith?.text]);
  const stage = map.data?.stages.find((s) => s.number === n);
  const total = map.data?.stages.length ?? 42;

  if (textId !== 'nawawi' || !Number.isInteger(n) || n < 1) return <EmptyState title="مرحلة غير موجودة"><Link href="/student/learn/nawawi" className="font-bold text-secondary">العودة للخريطة</Link></EmptyState>;
  if (map.isLoading || text.isLoading) return <div className="grid gap-4 lg:grid-cols-[22rem_1fr]"><SkeletonBlock className="h-96" /><SkeletonBlock className="h-96" /></div>;
  if (map.isError) return <ErrorState message="تعذّر تحميل حالة المرحلة." onRetry={() => map.refetch()} />;
  if (text.isError) return <ErrorState message="تعذّر تحميل نص الحديث." onRetry={() => text.refetch()} />;
  if (!stage || !hadith) return <EmptyState title="مرحلة غير موجودة"><Link href="/student/learn/nawawi" className="font-bold text-secondary">العودة للخريطة</Link></EmptyState>;
  if (stage.status === 'locked') return (
    <EmptyState icon={<Lock size={30} className="text-muted-foreground" />} title={`المرحلة ${num(n)} مغلقة`}>
      <span data-testid="text-stage-locked">اجتز المرحلة السابقة بنحو {num(map.data?.threshold ?? 90)}٪ لتُفتح هذه المرحلة.</span>{' '}
      <Link href="/student/learn/nawawi" className="font-bold text-secondary" data-testid="link-back-map">العودة للخريطة</Link>
    </EmptyState>
  );

  const examHadith = { id: hadith.id, number: hadith.number, title: hadith.title, text: hadith.text };
  if (mode === 'exam') return <div data-testid="view-stage-exam"><StageExam hadith={examHadith} onClose={() => { setMode('study'); map.refetch(); }} /></div>;
  if (mode === 'practice') return (
    <div data-testid="view-stage-practice">
      <button className="mb-4 inline-flex items-center gap-2 rounded-full border px-5 py-2 font-ui text-sm font-semibold hover:bg-muted" onClick={() => setMode('study')} data-testid="button-back-study"><ArrowRight size={15} />العودة إلى الدراسة</button>
      <RecitationBook hadiths={[hadith]} sourceStatus={text.data?.sourceStatus} />
    </div>
  );

  const prev = map.data?.stages.find((s) => s.number === n - 1);
  const next = map.data?.stages.find((s) => s.number === n + 1);
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/student/learn/nawawi" className="inline-flex items-center gap-1.5 font-ui text-sm font-semibold text-secondary" data-testid="link-map"><ArrowRight size={15} />الخريطة</Link>
        <span className="font-ui text-sm text-muted-foreground" data-testid="text-stage-status">المرحلة {num(n)} من {num(total)} · {stage.status === 'passed' ? `مجتازة${stage.bestPercent != null ? ` (${num(stage.bestPercent)}٪)` : ''}` : 'الحالية'}</span>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(19rem,24rem)_minmax(0,1fr)]" dir="ltr">
        <div dir="rtl" className="order-2 min-w-0 lg:order-1">
          <StageAssistant key={chatKey} conversationId={chat.cid} onConversationId={(id) => patchChat({ cid: id })} draft={chat.draft} onDraft={(v) => patchChat({ draft: v })} hadith={hadith} selectedWord={word} wordRequest={req} onBusyChange={setBusy} />
        </div>
        <article dir="rtl" className="paper-card order-1 min-w-0 p-6 sm:p-8 lg:order-2" data-testid="card-stage-hadith">
          <p className="font-ui text-xs font-semibold text-secondary">الحديث {num(hadith.number)}</p>
          <h1 className="mt-1 font-display text-2xl font-bold sm:text-3xl" data-testid="text-hadith-title">{hadith.title}</h1>
          <p className="mt-2 font-ui text-xs text-muted-foreground">اضغط أي كلمة ليُطلب شرحها من المساعد.</p>
          <div className="ornament my-5"><span className="text-xs">*</span></div>
          <p className="hadith-text text-2xl sm:text-[1.7rem]" data-testid="text-hadith-body">
            {words.map((w, i) => (
              <span key={i}>
                <button type="button" disabled={busy} onClick={() => { setWord(w); setReq((r) => r + 1); }}
                  aria-label={`اشرح كلمة ${w}`} aria-pressed={word === w}
                  className={`rounded-md px-0.5 transition-colors hover:bg-secondary/15 focus-visible:bg-secondary/15 disabled:cursor-wait ${word === w ? 'bg-secondary/20 text-secondary' : ''}`}
                  data-testid={`button-word-${i}`}>{w}</button>{' '}
              </span>
            ))}
          </p>
          <div className="mt-8 flex flex-wrap gap-3 border-t pt-5">
            <button className="inline-flex items-center gap-2 rounded-full border border-secondary px-6 py-3 font-ui font-bold text-secondary hover:bg-secondary/10" onClick={() => setMode('practice')} data-testid="button-practice">
              <Mic size={17} />التدريب على التسميع</button>
            <button className="inline-flex items-center gap-2 rounded-full bg-secondary px-6 py-3 font-ui font-bold text-secondary-foreground" onClick={() => setMode('exam')} data-testid="button-start-exam">
              <GraduationCap size={17} />الامتحان</button>
          </div>
          <div className="mt-5 flex justify-between font-ui text-sm">
            {prev && prev.status !== 'locked' ? <Link href={`/student/learn/nawawi/${prev.number}`} className="inline-flex items-center gap-1 text-secondary" data-testid="link-prev-stage"><ChevronRight size={15} />السابقة</Link> : <span />}
            {next && next.status !== 'locked' ? <Link href={`/student/learn/nawawi/${next.number}`} className="inline-flex items-center gap-1 text-secondary" data-testid="link-next-stage">التالية<ChevronLeft size={15} /></Link> : <span />}
          </div>
        </article>
      </div>
    </div>
  );
}
