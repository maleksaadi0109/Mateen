import { intlTag } from '@/lib/i18n';
import { fmt } from '@/lib/i18n';
import { tr } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import { getGetScholarlyGeometryHistoryQueryKey, useGetScholarlyGeometryHistory } from '@workspace/api-client-react';
import type { CollationGeometrySnapshot } from '@workspace/api-client-react';
import { btnGhost } from './shared';

export default function GeometryHistory({ sourceId, passageId, excerptId, imageUrl, imageSha256, onDenied }: {
  sourceId: string; passageId: string; excerptId: string; imageUrl: string; imageSha256: string;
  onDenied: () => void;
}) {
  const [preview, setPreview] = useState<{ eventId: string; side: string; snapshot: CollationGeometrySnapshot } | null>(null);
  const history = useGetScholarlyGeometryHistory(sourceId, passageId, excerptId, {
    query: { queryKey: getGetScholarlyGeometryHistoryQueryKey(sourceId, passageId, excerptId),
      retry: false, staleTime: 0, gcTime: 0, refetchOnMount: 'always' },
    request: { credentials: 'include', cache: 'no-store' },
  });
  const status = (history.error as { status?: number } | null)?.status;
  useEffect(() => {
    if (history.isError && (status === 401 || status === 403)) onDenied();
  }, [history.isError, status, onDenied]);
  // Do not retain historical overlays after a refetch, error, or removal.
  const visible = !history.isFetching && !history.isError && preview &&
    history.data?.some(e => e.id === preview.eventId) &&
    preview.snapshot.imageMatches && preview.snapshot.imageSha256 === imageSha256 ? preview : null;
  function snapshotView(snapshot: CollationGeometrySnapshot | null, label: string, eventId: string) {
    return <div className="min-w-0 space-y-1 rounded-lg border p-2">
      <h5>{label}</h5>
      {!snapshot ? <p>{tr("لا حدود سابقة متاحة أو السجل غير صالح؛ لا تُستعاد حدود أقدم.")}</p> : <>
        <p>{snapshot.rectangles.length ? fmt("{a} أجزاء محددة", "{a} marked parts", { a: snapshot.rectangles.length }) : tr("حدود فارغة — سحب التظليل")}</p>
        <p>{snapshot.imageMatches ? tr("بصمة الصورة مطابقة") : tr("بصمة الصورة مختلفة — المعاينة ممنوعة")}{tr("؛")}{' '}{snapshot.textMatches ? tr("بصمة النص والمقتطف مطابقة") : tr("بصمة النص أو المقتطف مختلفة — دليل قديم فقط")}</p>
        <dl className="break-all text-xs" dir="ltr">
          <dt>SHA-256 image</dt><dd>{snapshot.imageSha256}</dd>
          <dt>SHA-256 original text</dt><dd>{snapshot.originalTextSha256}</dd>
          <dt>SHA-256 excerpt</dt><dd>{snapshot.excerptSha256}</dd>
        </dl>
        <ul dir="ltr" className="text-xs">
          {snapshot.rectangles.map((r, i) => <li key={i}>
            x={r.x}, y={r.y}, width={r.width}, height={r.height}
          </li>)}
        </ul>
        {!!snapshot.rectangles.length && <button type="button" className={btnGhost}
          disabled={!snapshot.imageMatches || snapshot.imageSha256 !== imageSha256}
          onClick={() => setPreview({ eventId, side: label, snapshot })}>{tr("معاينة")}{' '}{label}{' '}{tr("كتظليل تاريخي")}</button>}
      </>}
    </div>;
  }
  if (history.isError) {
    return <div role="alert">
      <p>{status === 401 || status === 403 ? tr("لا صلاحية لك لعرض سجل الحدود.") : tr("تعذر تحميل سجل الحدود.")}</p>
      <button type="button" className={btnGhost} onClick={() => {
        setPreview(null);
        if (status === 401 || status === 403) onDenied();
        else void history.refetch();
      }}>{status === 401 || status === 403 ? tr("إغلاق الدليل") : tr("إعادة تحميل السجل")}</button>
    </div>;
  }
  return <section className="space-y-2 rounded-xl border p-3" aria-label={tr("تاريخ حدود المقتطف")}>
    <h4>{tr("تاريخ حدود المقتطف المختار")}</h4>
    <p>{tr("سجل تاريخي غير نافذ، وليس اعتمادًا علميًا أو إخلاء حقوق. لا يعيد توثيقًا مسحوبًا؛ بقية الصفحة مستبعدة.")}</p>
    <button type="button" className={btnGhost} disabled={history.isFetching} onClick={() => { setPreview(null); void history.refetch(); }}>{tr("تحديث السجل")}</button>
    {history.isFetching ? <p role="status">{tr("جارٍ تحميل سجل الحدود…")}</p> : <>
      {!history.data?.length && <p>{tr("لا تعديلات مسجلة لهذا المقتطف.")}</p>}
      {history.data?.map(event => <article key={event.id} className="space-y-2 border-t pt-2">
        <p>{event.change === 'revoked' ? tr("سحب الحدود") : event.change === 'invalid' ? tr("سجل غير صالح للمعاينة") : tr("توثيق أو تعديل الحدود")}</p>
        <p>{tr("المراجع:")}{' '}<bdi>{event.actorId}</bdi> — {new Date(event.createdAt).toLocaleString(intlTag())}</p>
        <p className="whitespace-pre-wrap">{tr("السبب:")}{' '}{event.reason}</p>
        <p className="break-all text-xs">{tr("مرجع سجل التدقيق:")}{' '}<bdi>{event.id}</bdi></p>
        <div className="grid gap-2 md:grid-cols-2">
          {snapshotView(event.before, tr("الحدود السابقة"), event.id)}
          {snapshotView(event.after, tr("الحدود اللاحقة"), event.id)}
        </div>
      </article>)}
    </>}
    {visible && <div className="space-y-2" data-testid="geometry-history-preview">
      <p role="status">{tr("تظليل تاريخي غير نافذ —")}{' '}{visible.side}{tr(". لا يستبدل الحدود الحالية ولا يعيد المسحوب.")}</p>
      <button type="button" className={btnGhost} onClick={() => setPreview(null)}>{tr("إغلاق المعاينة التاريخية")}</button>
      <div className="max-h-[32rem] overflow-auto rounded-lg border" dir="ltr">
        <div className="relative">
          <img src={imageUrl} alt={tr("معاينة تاريخية غير نافذة لحدود المقتطف فقط")} className="block w-full" />
          {visible.snapshot.rectangles.map((r, i) => <div key={i}
            className="pointer-events-none absolute border-2 border-dashed border-purple-600 bg-purple-400/20"
            data-testid="geometry-historical"
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` }} />)}
        </div>
      </div>
    </div>}
  </section>;
}
