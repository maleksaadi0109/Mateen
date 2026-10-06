import { fmt } from '@/lib/i18n';
import { tr } from '@/lib/i18n';
import { TaskSessionBanner } from '@/components/mateen/task-session-banner';
import { useState } from 'react';
import { Link, useParams } from 'wouter';
import { useUser } from '@clerk/react';
import { ArrowRight, Lock, GraduationCap } from 'lucide-react';
import { EmptyState, ErrorState, SkeletonBlock } from '@/components/mateen/bits';
import { num, usePageMeta } from '@/lib/mateen';
import PassageSelection from '@/components/mateen/passage-selection';
import StageAssistant from '@/components/mateen/stage-assistant';
import StageExam from '@/components/mateen/stage-exam';
import BookMascot from '@/components/mateen/book-mascot';
import JourneyGuide from '@/components/mateen/journey/journey-guide';
import { chapterStatus, useTuhfaMap, useTuhfaText } from './tuhfa-map';

type Mode = 'study' | 'exam';
const back = <Link href="/student/learn/tuhfa" className="font-bold text-secondary" data-testid="link-back-tuhfa">{tr("العودة لأبواب التحفة")}</Link>;

export default function TuhfaChapterPage() {
  const { chapterNumber } = useParams<{ chapterNumber: string }>();
  const cn_ = Number(chapterNumber);
  const { user } = useUser();
  const map = useTuhfaMap();
  const text = useTuhfaText();
  const chapter = text.data?.chapters.find((c) => c.number === cn_);
  usePageMeta(fmt("{a} | مَتِين", "{a} | Mateen", { a: chapter?.title ?? tr("باب من التحفة") }), tr("اقرأ الباب كاملاً، ثم سمّع أبياته كلها في محاولة واحدة."));

  const stages = map.data?.stages ?? [];
  const [mode, setMode] = useState<Mode>('study');
  const [word, setWord] = useState<string | null>(null);
  const [req, setReq] = useState(0);
  const [busy, setBusy] = useState(false);
  const chatKey = `${user?.id ?? 'guest'}:tuhfa:ch${cn_}`;
  const [chats, setChats] = useState<Record<string, { cid: string | null; draft: string }>>({});
  const chat = chats[chatKey] ?? { cid: null, draft: '' };
  const patchChat = (p: Partial<{ cid: string | null; draft: string }>) => setChats((c) => ({ ...c, [chatKey]: { ...(c[chatKey] ?? { cid: null, draft: '' }), ...p } }));
  const [modeKey, setModeKey] = useState(chatKey);
  if (modeKey !== chatKey) { setModeKey(chatKey); setMode('study'); setWord(null); setBusy(false); setReq(0); }

  if (!Number.isInteger(cn_) || cn_ < 1) return <EmptyState title={tr("باب غير موجود")}>{back}</EmptyState>;
  if (map.isLoading || text.isLoading) return <div className="grid gap-4 lg:grid-cols-[22rem_1fr]"><SkeletonBlock className="h-96" /><SkeletonBlock className="h-96" /></div>;
  if (map.isError) return <ErrorState message={tr("تعذّر تحميل حالة الباب.")} onRetry={() => map.refetch()} />;
  if (text.isError) return <ErrorState message={tr("تعذّر تحميل نص الباب.")} onRetry={() => text.refetch()} />;
  if (!chapter) return <EmptyState icon={<BookMascot size={72} mood="rest" />} title={tr("باب غير موجود")}>{back}</EmptyState>;
  const status = chapterStatus(chapter, stages);
  if (status === 'locked') return (
    <EmptyState icon={<Lock size={30} className="text-muted-foreground" />} title={fmt("{a} مغلق", "{a} is locked", { a: chapter.title })}>
      <span data-testid="text-chapter-locked">{tr("أتمم الباب السابق بأكثر من")}{' '}{num(map.data?.threshold ?? 90)}{tr("٪ ليُفتح هذا الباب.")}</span>{' '}{back}
    </EmptyState>
  );

  const threshold = map.data?.threshold ?? 90;
  const best = stages.find((s) => s.number === chapter.number)?.bestPercent;
  const chapters = text.data?.chapters ?? [];
  const nextCh = chapters.find((c) => c.number === chapter.number + 1);
  const nextHref = nextCh ? `/student/learn/tuhfa/${nextCh.number}` : '/student/learn/tuhfa';
  const full = chapter.verses.map((v) => v.text).join('\n');

  if (mode === 'exam') return (
    <div data-testid="view-chapter-exam">
      <StageExam key={chatKey} textId="tuhfa" nextHref={nextHref} hadith={{ id: chapter.number, number: chapter.number, title: chapter.title, text: full }} onClose={() => { setMode('study'); map.refetch(); }} />
    </div>
  );

  return (
    <div>
      <TaskSessionBanner />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/student/learn/tuhfa" className="inline-flex items-center gap-1.5 font-ui text-sm font-semibold text-secondary" data-testid="link-tuhfa-map"><ArrowRight size={15} />{tr("أبواب التحفة")}</Link>
        <span className="font-ui text-sm text-muted-foreground" data-testid="text-chapter-status">{tr("الباب")}{' '}{num(chapter.number)} · {status === 'passed' ? fmt("مُسمّع{a}", "Recited{a}", { a: best != null ? fmt(" ({a}٪)", " ({a}%)", { a: num(best) }) : '' }) : tr("الحالي")}
        </span>
      </div>

      <section className="paper-card mb-5 overflow-hidden p-4 sm:p-7" data-testid="card-chapter-text">
        <p className="font-ui text-xs font-semibold text-secondary">{tr("الباب")}{' '}{num(chapter.number)} · {num(chapter.verses.length)}{' '}{tr("أبيات")}</p>
        <h1 className="mt-1 py-1 font-display text-2xl font-bold leading-[2] sm:text-3xl" data-testid="text-chapter-title">{chapter.title}</h1>
        <JourneyGuide mood={status === 'passed' ? 'calm' : 'cheer'} message={tr("اقرأ الباب كاملاً أولاً. حدّد كلمة أو مقطعاً متصلاً لتسأل المساعد عنه، ثم سمّع الباب كله في محاولة واحدة.")} />
        <div className="ornament my-3"><span className="text-xs">*</span></div>
        <PassageSelection key={chatKey} text={full} poem={chapter.verses.map((v) => ({ number: v.number, text: v.text }))} selected={word} onSelect={setWord} onAsk={() => setReq((r) => r + 1)} busy={busy} />
        <div className="mt-8 border-t pt-5">
          <button className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-secondary px-8 py-3 font-ui text-lg font-bold text-secondary-foreground shadow-[0_4px_0_hsl(24_90%_20%)] transition active:translate-y-1 active:shadow-none sm:w-auto" onClick={() => setMode('exam')} data-testid="button-recite-chapter">
            <GraduationCap size={20} />{status === 'passed' ? tr("أعد تسميع الباب") : tr("سمّع الباب كاملاً")}
          </button>
          <p className="mt-3 font-ui text-xs leading-6 text-muted-foreground">{tr("تُسمَّع كل أبيات الباب في محاولة واحدة، والنجاح بأكثر من")}{' '}{num(threshold)}{tr("٪. هذا تدريب تقريبي لمطابقة الكلمات، وليس تقييمًا للنطق أو التجويد.")}</p>
        </div>
      </section>

      <div className="max-w-2xl" data-testid="card-chapter-assistant">
        <StageAssistant key={chatKey} textId="tuhfa" unit="الباب" conversationId={chat.cid} onConversationId={(id) => patchChat({ cid: id })} draft={chat.draft} onDraft={(v) => patchChat({ draft: v })}
          hadith={{ number: chapter.number, title: chapter.title, text: full }} selectedWord={word} wordRequest={req} onBusyChange={setBusy} />
      </div>
    </div>
  );
}
