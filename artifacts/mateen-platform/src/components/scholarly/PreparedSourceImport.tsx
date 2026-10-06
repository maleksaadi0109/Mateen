import { intlTag } from '@/lib/i18n';
import { tr } from '@/lib/i18n';
import { useState } from 'react';
import { useAuth } from '@clerk/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getListScholarlyAuditQueryKey, getListScholarlySourcesQueryKey,
  importAljam3Source, useGetAljam3Import,
} from '@workspace/api-client-react';
import { btnPrimary, btnGhost } from './shared';

function importError(error: unknown) {
  const status = (error as { status?: number })?.status;
  if (status === 401 || status === 403) return tr("انتهت الجلسة أو لم تعد مخوّلة. ادخل بجلسة إدارة مؤمّنة ثم أعد المحاولة.");
  if (status === 409) return tr("توجد نسخة متعارضة أو استيراد سابق غير مكتمل. راجع المصادر الموجودة؛ لم تُضف مقاطع جديدة.");
  if (status === 429) return tr("طلبات كثيرة. انتظر دقيقة ثم أعد المحاولة؛ لن تتكرر الحزمة.");
  return tr("تعذّر تأكيد الاستيراد بسبب الاتصال أو الخادم. قد يكون الحفظ قد اكتمل. أعد المحاولة بأمان للتحقق؛ لن تتكرر الحزمة.");
}

export default function PreparedSourceImport() {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  if (!isLoaded || !isSignedIn || !userId || !sessionId) return null;
  return <SessionImport key={JSON.stringify([userId, sessionId])} />;
}

export function SessionImport() {
  const qc = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const info = useGetAljam3Import();
  const mutation = useMutation({
    gcTime: 0, retry: false,
    mutationFn: async () => {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Cover token acquisition as well as the network request.
        return await Promise.race([
          importAljam3Source({ confirmUnreviewed: true }, { signal: controller.signal }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => { controller.abort(); reject(new Error('Import timeout')); }, 30_000);
          }),
        ]);
      } finally { clearTimeout(timer); }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getListScholarlySourcesQueryKey() });
      void qc.invalidateQueries({ queryKey: getListScholarlyAuditQueryKey() });
    },
  });
  if (info.isLoading) return <p role="status">{tr("جارٍ تحميل بيانات الحزمة المحلية…")}</p>;
  if (info.isError || !info.data) return <div className="paper-card p-5" role="alert">
    <p>{tr("تعذّر تحميل بيانات الحزمة المحلية.")}</p>
    <button className={btnGhost} onClick={() => info.refetch()}>{tr("إعادة تحميل الحزمة")}</button>
  </div>;
  const p = info.data;
  return <section className="paper-card space-y-4 p-6" data-testid="prepared-source-import">
    <h2 className="font-display text-xl font-bold">{tr("استيراد المقاطع الجاهزة من الجامع")}</h2>
    <p>{p.title} — {p.passageCount.toLocaleString(intlTag())}{' '}{tr("مقطعًا")}</p>
    <a className="underline" href={p.sourceUrl} target="_blank" rel="noreferrer">{tr("المصدر الأصلي")}</a>
    <p className="font-ui text-sm">{tr("إفادة صاحب المشروع (ليست تحققًا مستقلًا للترخيص):")}{' '}{p.authorizationStatement}</p>
    <ul className="list-inside list-disc space-y-1 font-ui text-sm text-muted-foreground">
      {p.warnings.map(warning => <li key={warning}>{warning}</li>)}
    </ul>
    <p className="font-ui text-sm">{tr("تُحفظ الحزمة كاملة كمسودة باسم حسابك المخوّل، دون منح صلاحيات أو مراجعة أو فهرسة تلقائية. إعادة الطلب تعيد نتيجة الاستيراد السابق حتى لو تغيّرت حالة المصدر لاحقًا.")}</p>
    <label className="flex items-start gap-3 font-ui text-sm">
      <input type="checkbox" checked={confirmed} disabled={mutation.isPending}
        onChange={e => setConfirmed(e.target.checked)} data-testid="confirm-prepared-import" />{tr("أفهم أن النص غير مدقق وأن إفادة السماح تحتاج مراجعة مستقلة، وأريد استيراده كمسودة فقط.")}</label>
    <button className={btnPrimary} disabled={!confirmed || mutation.isPending}
      onClick={() => mutation.mutate()} data-testid="button-import-prepared">
      {mutation.isPending ? tr("جارٍ الاستيراد…") : mutation.isError ? tr("إعادة المحاولة بأمان") : tr("استيراد الحزمة كمسودة")}
    </button>
    {mutation.isPending && <p role="status">{tr("جارٍ حفظ")}{' '}{p.passageCount.toLocaleString(intlTag())}{' '}{tr("مقطعًا في عملية واحدة…")}</p>}
    {mutation.isError && <p role="alert" className="font-ui text-sm text-destructive">{importError(mutation.error)}</p>}
    {mutation.isSuccess && <div role="status" data-testid="prepared-import-result" className="space-y-2 font-ui text-sm">
      <p>{mutation.data.outcome === 'imported' ? tr("نجح الاستيراد كمسودة غير مراجعة.") : tr("الحزمة مستوردة سابقًا؛ لم تُنشأ نسخة مكررة ولم تتغير حالة المصدر.")}</p>
      <p>{tr("إجمالي الحزمة:")}{' '}{mutation.data.totalCount.toLocaleString(intlTag())}{' '}{tr("· أُضيف الآن:")}{' '}{mutation.data.importedCount.toLocaleString(intlTag())}{' '}{tr("· موجود سابقًا:")}{' '}{mutation.data.existingCount.toLocaleString(intlTag())}</p>
      <a className="underline" href={`#source-${mutation.data.sourceId}`}>{tr("عرض المصدر ومقاطعه أدناه")}</a>
    </div>}
  </section>;
}
