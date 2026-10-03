import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listPracticeReports, savePracticeReport, getPracticeReport, deletePracticeReport, type PracticeReportInput } from '@workspace/api-client-react';
import { num } from '@/lib/mateen';
import type { HistoryEntry } from './recitation-history';
import type { ReportSnapshot } from './recitation-report';

export function useAccountReports(userId: string | null) {
  const client = useQueryClient();
  const [offset, setOffset] = useState(0);
  const key = ['practice-reports', userId];
  useEffect(() => () => {
    void client.cancelQueries({ queryKey: ['practice-reports', userId] });
    void client.cancelQueries({ queryKey: ['practice-report-words', userId] });
    client.removeQueries({ queryKey: ['practice-reports', userId] });
    client.removeQueries({ queryKey: ['practice-report-words', userId] });
  }, [client, userId]);
  const query = useQuery({
    queryKey: [...key, offset], enabled: !!userId,
    queryFn: ({ signal }) => listPracticeReports({ offset }, { signal }),
    staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true,
  });
  const save = async (input: PracticeReportInput) => {
    if (!userId) throw new Error('Sign in first');
    const result = await savePracticeReport(input);
    await client.invalidateQueries({ queryKey: key });
    setOffset(0);
    return result;
  };
  const remove = async (id: string) => {
    await deletePracticeReport(id);
    client.removeQueries({ queryKey: ['practice-report-words', userId, id] });
    await client.invalidateQueries({ queryKey: key });
    setOffset(0);
  };
  return { query, save, remove, offset, setOffset };
}

export function reportInput(report: ReportSnapshot): PracticeReportInput {
  return {
    attemptId: report.attemptId, consent: true, complete: true,
    matched: report.matched, attempted: report.attempted,
    analyses: report.analyses.map(({ issues: _issues, ...summary }) => summary),
    issues: report.issues.map(({ index, expected, heard, kind }) => ({ index, expected, heard, kind })),
  };
}

export function AccountRecitationHistory({ account, local, onOpen }: {
  account: ReturnType<typeof useAccountReports>; local: HistoryEntry[];
  onOpen: (report: ReportSnapshot) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setMessage('');
    try { await action(); } catch { setMessage('تعذّرت العملية. لم يُحذف السجل المحلي؛ أعد المحاولة.'); }
    finally { setBusy(false); }
  };
  return <section className="rounded-2xl border bg-card p-5 font-ui text-xs" data-testid="account-recitation-history">
    <h3 className="font-display text-xl font-bold">تقارير محفوظة في حسابك</h3>
    <p className="mt-2 text-muted-foreground">متاحة بعد تسجيل الدخول من أي جهاز. تُحفظ فقط باختيارك؛ لا صوت ولا نص مفرّغ كامل. هذه مقارنات آلية غير مؤكدة، ولا تغيّر درجات الاختبارات أو إتمام الدراسة.</p>
    {message && <p role="alert" className="mt-3 text-destructive">{message}</p>}
    {account.query.isLoading && <p role="status" className="mt-3">جارٍ تحميل التقارير…</p>}
    {account.query.isError && <p role="alert" className="mt-3">تعذّر تحميل تقارير الحساب. <button onClick={() => void account.query.refetch()} className="underline">إعادة المحاولة</button></p>}
    {account.query.data?.reports.length === 0 && <p className="mt-3">لا توجد تقارير محفوظة في الحساب بعد.</p>}
    <ol className="mt-3 divide-y">
      {account.query.data?.reports.map(e => <li key={e.id} className="space-y-2 py-3" data-testid={`account-report-${e.id}`}>
        <p>{new Date(e.createdAt).toLocaleString('ar')} · تطابق تقريبي {num(Math.round(100 * e.matched / e.attempted))}٪ · {num(e.issueCount)} اختلاف محفوظ</p>
        {!e.complete && <p className="text-muted-foreground">محاولة محلية قديمة: تفاصيل جزئية فقط، وليست تقريرًا كاملًا.</p>}
        <div className="flex flex-wrap gap-3">
          <button disabled={busy} className="min-h-9 rounded-full border px-3 font-bold disabled:opacity-50" data-testid={`open-account-report-${e.id}`} onClick={() => void run(async () => {
            const detail = await getPracticeReport(e.id);
            onOpen({ attemptId: detail.attemptId, matched: detail.matched, attempted: detail.attempted,
              issues: [], analyses: detail.analyses.map(a => ({ ...a, issues: [] })), priorCounts: new Map(),
              accountReportId: detail.id, complete: detail.complete, issueCount: detail.issueCount });
          })}>فتح التقرير الكامل</button>
          {confirmId === e.id ? <>
            <button disabled={busy} className="min-h-9 rounded-full bg-destructive px-3 text-destructive-foreground" onClick={() => void run(async () => { await account.remove(e.id); setConfirmId(null); })}>تأكيد حذف التقرير من الحساب نهائيًا</button>
            <button onClick={() => setConfirmId(null)} className="min-h-9 px-3">إلغاء</button>
          </> : <button disabled={busy} className="min-h-9 px-3 text-destructive" data-testid={`delete-account-report-${e.id}`} onClick={() => setConfirmId(e.id)}>حذف من الحساب</button>}
        </div>
      </li>)}
    </ol>
    <div className="mt-3 flex gap-3">
      {account.offset > 0 && <button disabled={busy} onClick={() => account.setOffset(Math.max(0, account.offset - 20))} className="min-h-9 rounded-full border px-3">السابق</button>}
      {account.query.data?.hasMore && <button disabled={busy} onClick={() => account.setOffset(account.offset + 20)} className="min-h-9 rounded-full border px-3">التالي</button>}
    </div>
    {local.length > 0 && <details className="mt-4 rounded-xl border p-3" data-testid="legacy-report-import">
      <summary className="cursor-pointer font-bold">نقل محاولة محلية قديمة إلى الحساب (اختياري)</summary>
      <p className="mt-2 text-muted-foreground">لن تُنقل تلقائيًا ولن تُحذف من هذا المتصفح. المحاولات القديمة تحتفظ بأول 100 اختلاف فقط؛ لا يمكن استرجاع التفاصيل المفقودة. الضغط على «أوافق وأنقل» يسمح بحفظ هذا الملخص واختلافاته في الحساب.</p>
      {local.map(e => <div key={e.id} className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
        <span>{new Date(e.at).toLocaleString('ar')}</span>
        {e.analyses?.length && e.issues.every(i => i.index != null) ? <button disabled={busy} className="min-h-9 rounded-full border px-3 disabled:opacity-50" onClick={() => void run(async () => {
          await account.save({ attemptId: `legacy-${e.id}`, consent: true, complete: false,
            matched: e.matched, attempted: e.attempted, analyses: e.analyses!,
            issues: e.issues.map(i => ({ ...i, index: i.index! })) });
          setMessage('حُفظ الملخص الجزئي في الحساب؛ بقيت المحاولة المحلية دون تغيير.');
        })}>أوافق وأنقل هذه المحاولة</button> : <span className="text-muted-foreground">تظل محليًا: لا تحتوي بيانات كافية لنقل تفصيل الأحاديث.</span>}
      </div>)}
    </details>}
  </section>;
}