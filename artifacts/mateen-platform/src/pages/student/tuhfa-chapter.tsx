import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearch } from 'wouter';
import { useUser } from '@clerk/react';
import { ArrowRight, Check, Lock, GraduationCap, ChevronRight, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, ErrorState, SkeletonBlock } from '@/components/mateen/bits';
import { num, usePageMeta } from '@/lib/mateen';
import PassageSelection from '@/components/mateen/passage-selection';
import StageAssistant from '@/components/mateen/stage-assistant';
import StageExam from '@/components/mateen/stage-exam';
import BookMascot from '@/components/mateen/book-mascot';
import { chapterStatus, useTuhfaMap, useTuhfaText } from './tuhfa-map';

type Mode = 'study' | 'exam';
const back = <Link href="/student/learn/tuhfa" className="font-bold text-secondary" data-testid="link-back-tuhfa">العودة لأبواب التحفة</Link>;

export default function TuhfaChapterPage() {
  const { chapterNumber } = useParams<{ chapterNumber: string }>();
  const cn_ = Number(chapterNumber);
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const map = useTuhfaMap();
  const text = useTuhfaText();
  const chapter = text.data?.chapters.find((c) => c.number === cn_);
  usePageMeta(`${chapter?.title ?? 'باب من التحفة'} | مَتِين`, 'اقرأ الباب كاملاً، ثم سمّع أبياته بيتاً بيتاً.');

  const stages = map.data?.stages ?? [];
  const statusOf = (n: number) => stages.find((s) => s.number === n)?.status ?? 'locked';
  const requested = Number(new URLSearchParams(search).get('verse'));
  const fallback = chapter ? (chapter.verses.find((v) => statusOf(v.number) === 'current') ?? chapter.verses[0]) : undefined;
  const verse = chapter?.verses.find((v) => v.number === requested) ?? fallback;

  // Keep ?verse=N valid and reflected in the URL.
  useEffect(() => {
    if (!chapter || !verse || map.isLoading) return;
    if (requested !== verse.number) setLocation(`/student/learn/tuhfa/${chapter.number}?verse=${verse.number}`, { replace: true });
  }, [chapter, verse, requested, map.isLoading, setLocation]);

  const [mode, setMode] = useState<Mode>('study');
  const [word, setWord] = useState<string | null>(null);
  const [req, setReq] = useState(0);
  const [busy, setBusy] = useState(false);
  const chatKey = `${user?.id ?? 'guest'}:tuhfa:${verse?.number ?? 0}`;
  const [chats, setChats] = useState<Record<string, { cid: string | null; draft: string }>>({});
  const chat = chats[chatKey] ?? { cid: null, draft: '' };
  const patchChat = (p: Partial<{ cid: string | null; draft: string }>) => setChats((c) => ({ ...c, [chatKey]: { ...(c[chatKey] ?? { cid: null, draft: '' }), ...p } }));
  const [modeKey, setModeKey] = useState(chatKey);
  if (modeKey !== chatKey) { setModeKey(chatKey); setMode('study'); setWord(null); setBusy(false); setReq(0); }

  if (!Number.isInteger(cn_) || cn_ < 1) return <EmptyState title="باب غير موجود">{back}</EmptyState>;
  if (map.isLoading || text.isLoading) return <div className="grid gap-4 lg:grid-cols-[22rem_1fr]"><SkeletonBlock className="h-96" /><SkeletonBlock className="h-96" /></div>;
  if (map.isError) return <ErrorState message="تعذّر تحميل حالة الباب." onRetry={() => map.refetch()} />;
  if (text.isError) return <ErrorState message="تعذّر تحميل نص الباب." onRetry={() => text.refetch()} />;
  if (!chapter || !verse) return <EmptyState icon={<BookMascot size={72} mood="rest" />} title="باب غير موجود">{back}</EmptyState>;
  const cStatus = chapterStatus(chapter, stages);
  if (cStatus === 'locked') return (
    <EmptyState icon={<Lock size={30} className="text-muted-foreground" />} title={`${chapter.title} مغلق`}>
      <span data-testid="text-chapter-locked">أتمم أبيات الباب السابق بأكثر من {num(map.data?.threshold ?? 90)}٪ ليُفتح هذا الباب.</span>{' '}{back}
    </EmptyState>
  );

  const vStatus = statusOf(verse.number);
  const best = stages.find((s) => s.number === verse.number)?.bestPercent;
  const all = text.data?.chapters.flatMap((c) => c.verses.map((v) => ({ v: v.number, c: c.number }))) ?? [];
  const nextRef = all.find((x) => x.v === verse.number + 1);
  const nextHref = nextRef ? `/student/learn/tuhfa/${nextRef.c}?verse=${nextRef.v}` : '/student/learn/tuhfa';
  const hrefFor = (n: number) => `/student/learn/tuhfa/${chapter.number}?verse=${n}`;
  const idx = chapter.verses.findIndex((v) => v.number === verse.number);
  const prevV = chapter.verses[idx - 1], nextV = chapter.verses[idx + 1];

  if (mode === 'exam' && vStatus !== 'locked') return (
    <div data-testid="view-verse-exam">
      <StageExam key={chatKey} textId="tuhfa" nextHref={nextHref} hadith={{ id: verse.id, number: verse.number, title: verse.title, text: verse.text }} onClose={() => { setMode('study'); map.refetch(); }} />
    </div>
  );

  const passedCount = chapter.verses.filter((v) => statusOf(v.number) === 'passed').length;
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/student/learn/tuhfa" className="inline-flex items-center gap-1.5 font-ui text-sm font-semibold text-secondary" data-testid="link-tuhfa-map"><ArrowRight size={15} />أبواب التحفة</Link>
        <span className="font-ui text-sm text-muted-foreground" data-testid="text-chapter-status">الباب {num(chapter.number)} · {num(passedCount)} من {num(chapter.verses.length)} أبيات مُسمّعة</span>
      </div>

      <section className="paper-card mb-5 overflow-hidden p-5 sm:p-7" data-testid="card-chapter-text">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-ui text-xs font-semibold text-secondary">الباب {num(chapter.number)} · اقرأه كاملاً</p>
            <h1 className="mt-1 font-display text-2xl font-bold leading-snug sm:text-3xl" data-testid="text-chapter-title">{chapter.title}</h1>
          </div>
          <BookMascot size={52} mood={cStatus === 'passed' ? 'calm' : 'cheer'} className="-mt-1 shrink-0" />
        </div>
        <div className="ornament my-4"><span className="text-xs">*</span></div>
        <ol className="space-y-1.5">
          {chapter.verses.map((v) => {
            const s = statusOf(v.number);
            const active = v.number === verse.number;
            return (
              <li key={v.id}>
                <Link href={hrefFor(v.number)} aria-current={active ? 'true' : undefined} data-testid={`link-verse-${v.number}`}
                  className={cn('flex items-start gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-secondary/5', active && 'bg-secondary/10 ring-1 ring-secondary/40')}>
                  <span className={cn('mt-2 grid h-8 w-8 shrink-0 place-items-center rounded-full font-ui text-xs font-bold',
                    s === 'passed' ? 'bg-primary text-primary-foreground' : s === 'current' ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground')}>
                    {s === 'passed' ? <Check size={15} aria-label="مُسمّع" /> : num(v.number)}
                  </span>
                  <span className="hadith-text min-w-0 flex-1 whitespace-pre-line break-words text-lg sm:text-xl">{v.text}</span>
                  {s === 'locked' && <Lock size={14} className="mt-3 shrink-0 text-muted-foreground" aria-label="التسميع مغلق" />}
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(19rem,24rem)_minmax(0,1fr)]" dir="ltr">
        <div dir="rtl" className="order-2 min-w-0 lg:order-1">
          <StageAssistant key={chatKey} textId="tuhfa" conversationId={chat.cid} onConversationId={(id) => patchChat({ cid: id })} draft={chat.draft} onDraft={(v) => patchChat({ draft: v })}
            hadith={{ number: verse.number, title: verse.title, text: verse.text }} selectedWord={word} wordRequest={req} onBusyChange={setBusy} />
        </div>
        <article dir="rtl" className="paper-card order-1 min-w-0 p-6 sm:p-8 lg:order-2" data-testid="card-verse">
          <p className="font-ui text-xs font-semibold text-secondary" data-testid="text-verse-status">
            البيت {num(verse.number)} · {vStatus === 'passed' ? `مُسمّع${best != null ? ` (${num(best)}٪)` : ''}` : vStatus === 'current' ? 'الحالي' : 'التسميع مغلق'}
          </p>
          <h2 className="mt-1 font-display text-xl font-bold sm:text-2xl" data-testid="text-verse-title">{verse.title}</h2>
          <p className="mt-1 font-ui text-xs text-muted-foreground">اختر كلمة أو مقطعاً لتسأل عنه المساعد.</p>
          <div className="mt-4 whitespace-pre-line">
            <PassageSelection key={chatKey} text={verse.text} selected={word} onSelect={setWord} onAsk={() => setReq((r) => r + 1)} busy={busy} />
          </div>
          <div className="mt-8 border-t pt-5">
            {vStatus === 'locked' ? (
              <p className="flex items-center gap-2 rounded-xl border border-dashed p-3 font-ui text-sm text-muted-foreground" data-testid="text-verse-locked"><Lock size={15} />يُفتح تسميع هذا البيت بعد اجتياز البيت السابق بأكثر من {num(map.data?.threshold ?? 90)}٪. يمكنك قراءته الآن.</p>
            ) : (
              <button className="inline-flex min-h-11 items-center gap-2 rounded-full bg-secondary px-6 py-3 font-ui font-bold text-secondary-foreground" onClick={() => setMode('exam')} data-testid="button-recite-verse">
                <GraduationCap size={17} />{vStatus === 'passed' ? 'أعد تسميع البيت' : 'سمّع هذا البيت'}
              </button>
            )}
          </div>
          <div className="mt-5 flex justify-between font-ui text-sm">
            {prevV ? <Link href={hrefFor(prevV.number)} className="inline-flex items-center gap-1 text-secondary" data-testid="link-prev-verse"><ChevronRight size={15} />البيت السابق</Link> : <span />}
            {nextV ? <Link href={hrefFor(nextV.number)} className="inline-flex items-center gap-1 text-secondary" data-testid="link-next-verse">البيت التالي<ChevronLeft size={15} /></Link> : <span />}
          </div>
        </article>
      </div>
    </div>
  );
}
