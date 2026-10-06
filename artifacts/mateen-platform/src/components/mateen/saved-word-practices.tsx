import { tr } from '@/lib/i18n';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/react';
import { Play, Trash2 } from 'lucide-react';
import { deleteWordPractice, getWordPractice, listWordPractices, type WordPractice as SavedPractice } from '@workspace/api-client-react';
import { num } from '@/lib/mateen';
import WordPractice from './word-practice';

export const savedPracticesKey = (userId: string | null) => ['word-practices', userId] as const;

export function SavedWordPractices() {
  const { user, isLoaded } = useUser();
  const userId = isLoaded && user ? user.id : null;
  return <SavedInner key={userId ?? 'guest'} userId={userId} />;
}

function SavedInner({ userId }: { userId: string | null }) {
  const client = useQueryClient();
  const [open, setOpen] = useState<SavedPractice | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => () => {
    void client.cancelQueries({ queryKey: savedPracticesKey(userId) });
    client.removeQueries({ queryKey: savedPracticesKey(userId) });
  }, [client, userId]);
  const query = useQuery({ queryKey: savedPracticesKey(userId), enabled: !!userId, queryFn: ({ signal }) => listWordPractices({ signal }), staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true });
  const resume = async (id: string) => {
    setBusy(id); setError('');
    try { setOpen(await getWordPractice(id)); } catch { setError(tr("تعذّر فتح التمرين. قد يكون حُذف أو لم يعد مصدره متاحاً.")); } finally { setBusy(null); }
  };
  const remove = async (id: string) => {
    setBusy(id); setError('');
    try { await deleteWordPractice(id); setConfirm(null); await client.invalidateQueries({ queryKey: savedPracticesKey(userId) }); }
    catch { setError(tr("تعذّر الحذف. لم يتغيّر شيء؛ أعد المحاولة.")); } finally { setBusy(null); }
  };
  const [sp] = useSearchParams();
  const wanted = sp.get('practice');
  const tried = useRef<string | null>(null);
  const resumeRef = useRef(resume);
  resumeRef.current = resume;
  useEffect(() => {
    if (!userId || !wanted || tried.current === wanted) return;
    tried.current = wanted;
    void resumeRef.current(wanted);
  }, [userId, wanted]);
  if (!userId) return null;
  if (open) return <WordPractice hadith={{ id: open.reference.hadithId, title: open.reference.title }} resume={open} onClose={() => { setOpen(null); void query.refetch(); }} />;
  return (
    <section className="mb-10" aria-label={tr("تمارين الكلمات الصعبة المحفوظة")} data-testid="saved-word-practices">
      <h2 className="mb-1 font-display text-xl font-bold">{tr("تمارين الكلمات الصعبة")}</h2>
      <p className="mb-3 font-ui text-xs leading-relaxed text-muted-foreground">{tr("تمارين اخترتَ حفظها بكلماتها وملخصات محاولاتها فقط. حذف التمرين يزيل تمرينه ومحاولاته المحفوظة معاً، ولا يمسّ تقارير التسميع؛ وحذف التقرير لا يحذف التمرين.")}</p>
      {query.isLoading && <div className="space-y-2" data-testid="loading-saved-word-practices" aria-busy><div className="h-16 animate-pulse rounded-2xl bg-muted" /><div className="h-16 animate-pulse rounded-2xl bg-muted" /></div>}
      {query.isError && <div role="alert" className="rounded-xl border border-destructive/30 p-4 font-ui text-sm" data-testid="error-saved-word-practices">{tr("تعذّر تحميل التمارين المحفوظة.")}{' '}<button type="button" className="mx-2 min-h-10 underline" onClick={() => query.refetch()} data-testid="button-saved-word-practices-retry">{tr("إعادة المحاولة")}</button></div>}
      {query.data?.length === 0 && <p className="rounded-2xl border border-dashed p-5 text-center font-ui text-sm leading-relaxed text-muted-foreground" data-testid="empty-saved-word-practices">{tr("لا تمارين محفوظة بعد. أنشئ تمرينًا من صفحة «الكلمات الصعبة»، أو من تقرير التسميع اختر «تدرّب على الكلمات الصعبة»، ثم احفظه ليظهر هنا.")}</p>}
      {error && <p role="alert" className="mb-2 font-ui text-xs text-destructive" data-testid="text-saved-word-practices-error">{error}</p>}
      <ul className="space-y-2">
        {query.data?.map((p) => (
          <li key={p.id} className="rounded-2xl border bg-card p-4 font-ui text-sm" data-testid={`row-word-practice-${p.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold">{p.reference.title}</p>
                <p className="text-xs text-muted-foreground">{num(p.targets.length)}{' '}{tr("كلمة ·")}{' '}{num(p.attempts.length)}{' '}{tr("محاولة محفوظة ·")}{' '}{new Date(p.createdAt).toLocaleDateString('ar')}</p>
                {p.stale && <p className="mt-1 text-xs font-bold text-amber-700 dark:text-amber-300" data-testid={`text-word-practice-stale-${p.id}`}>{tr("تغيّر النص المرجعي؛ يلزم اختيار جديد ولا تُقارن المحاولات القديمة.")}</p>}
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={busy === p.id} onClick={() => resume(p.id)} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-resume-word-practice-${p.id}`}><Play size={13} />{p.stale ? tr("اختر من جديد") : tr("استأنف")}</button>
                <button type="button" onClick={() => setConfirm(p.id)} className="inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-xs font-bold" data-testid={`button-delete-word-practice-${p.id}`}><Trash2 size={13} />{tr("حذف")}</button>
              </div>
            </div>
            {confirm === p.id && (
              <div role="alertdialog" className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs" data-testid={`confirm-delete-word-practice-${p.id}`}>
                <p>{tr("سيُحذف هذا التمرين وكل محاولاته المحفوظة من حسابك نهائياً. لن تتأثر تقارير التسميع.")}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" disabled={busy === p.id} onClick={() => remove(p.id)} className="min-h-10 rounded-full bg-destructive px-4 font-bold text-destructive-foreground disabled:opacity-50" data-testid={`button-confirm-delete-word-practice-${p.id}`}>{tr("احذف التمرين ومحاولاته")}</button>
                  <button type="button" onClick={() => setConfirm(null)} className="min-h-10 rounded-full border px-4 font-bold" data-testid={`button-cancel-delete-word-practice-${p.id}`}>{tr("إلغاء")}</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
