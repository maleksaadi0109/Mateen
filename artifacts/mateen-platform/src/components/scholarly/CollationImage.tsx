import { intlTag } from '@/lib/i18n';
import { fmt } from '@/lib/i18n';
import { tr } from '@/lib/i18n';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CollationGeometryConflict, CollationGeometryState, CollationRectangle, ScholarlyCollation } from '@workspace/api-client-react';
import { btnGhost, field } from './shared';
import { getGetScholarlyCollationQueryKey, getGetScholarlyGeometryHistoryQueryKey, getListScholarlyAuditQueryKey, getScholarlyCollationImage, recordScholarlyGeometry } from '@workspace/api-client-react';
import GeometryHistory from './GeometryHistory';

const errorStatus = (e: unknown) => (e as { status?: number } | null)?.status;
const boxStyle = (r: CollationRectangle) => ({
  left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%`,
});
const emptyBox = { x: 0, y: 0, width: 0, height: 0 };

export default function CollationImage({ sourceId, entry: c }: { sourceId: string; entry: ScholarlyCollation }) {
  const client = useQueryClient();
  const [zoom, setZoom] = useState(false);
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ url?: string; err?: string }>({});
  const [selected, setSelected] = useState(c.excerpts[0]?.id ?? '');
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [boxes, setBoxes] = useState<CollationRectangle[]>([]);
  const [box, setBox] = useState<CollationRectangle>(emptyBox);
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [expectedRevision, setExpectedRevision] = useState<string | null>(null);
  const [conflict, setConflict] = useState<CollationGeometryState | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const active = useRef(true);
  const saved = c.geometry.find(g => g.excerptId === selected);
  const excerpt = c.excerpts.find(x => x.id === selected);
  const validBox = box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0 &&
    box.x + box.width <= 1 && box.y + box.height <= 1 && box.width * box.height < 1;
  const invalidDraft = (box.width !== 0 || box.height !== 0) && !validBox;
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => {
    const ac = new AbortController();
    let made: string | null = null;
    setState({});
    getScholarlyCollationImage(sourceId, c.passageId, { signal: ac.signal, credentials: 'include', cache: 'no-store', responseType: 'blob' })
      .then(async b => {
        if (!(b instanceof Blob) || !b.size) throw new Error('Empty evidence');
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await b.arrayBuffer())))
          .map(x => x.toString(16).padStart(2, '0')).join('');
        if (hash !== c.imageSha256) throw new Error('Changed evidence');
        if (ac.signal.aborted) return;
        made = URL.createObjectURL(b);
        setState({ url: made });
      }).catch(e => {
        if (ac.signal.aborted) return;
        const s = errorStatus(e);
        setState({ err: s === 401 || s === 403 ? tr("لا صلاحية لك لعرض صورة الأصل.") : tr("تعذر تحميل صورة مطابقة للبصمة؛ التظليل والتوثيق متوقفان.") });
      });
    return () => { ac.abort(); if (made) URL.revokeObjectURL(made); };
  }, [sourceId, c.passageId, c.imageSha256, tick]);
  function resetEditor() {
    setBox(emptyBox); setBoxes([]); setNote(''); setConfirmed(false); setMessage(''); start.current = null;
    setConflict(null);
    setExpectedRevision(c.geometryStates.find(s => s.excerptId === selected)?.revision ?? null);
  }
  async function save(revoke = false) {
    if (busy || conflict || !confirmed || note.trim().length < 10 || !state.url || !c.imageSha256) return;
    const rectangles = revoke ? [] : [...boxes, ...(validBox ? [box] : [])];
    if (!revoke && (invalidDraft || !rectangles.length || rectangles.length > 20)) return;
    setBusy(true); setMessage('');
    try {
      const record = await recordScholarlyGeometry(sourceId, c.passageId, {
        excerptId: selected, imageSha256: c.imageSha256, originalTextSha256: c.originalTextSha256,
        rectangles, note: note.trim(), manuallyVerified: true, expectedRevision,
      }, { credentials: 'include' });
      client.setQueryData<ScholarlyCollation[]>(getGetScholarlyCollationQueryKey(sourceId), old =>
        old?.map(item => item.passageId === c.passageId ? {
          ...item, geometry: [...item.geometry.filter(g => g.excerptId !== selected), ...(record.rectangles.length ? [record] : [])],
        } : item));
      await Promise.all([
        client.invalidateQueries({ queryKey: getGetScholarlyCollationQueryKey(sourceId) }),
        client.invalidateQueries({ queryKey: getListScholarlyAuditQueryKey() }),
        client.invalidateQueries({ queryKey: getGetScholarlyGeometryHistoryQueryKey(sourceId, c.passageId, selected) }),
      ]);
      if (active.current) { resetEditor(); setEditing(false); setMessage(revoke ? tr("سُحب التظليل؛ بقي سجل التوثيق محفوظًا.") : tr("حُفظت الحدود اليدوية للمقتطف فقط؛ لم يُمنح اعتماد علمي.")); }
    } catch (e) {
      if (active.current) {
        const data = (e as { data?: CollationGeometryConflict })?.data;
        if (errorStatus(e) === 409 && data?.code === 'geometry_conflict' && data.state) {
          setConflict(data.state); setConfirmed(false);
          setMessage(tr("لم يُحفظ التوثيق بسبب تعديل متزامن. بقيت مسودتك وحدودها وملاحظتك كما هي."));
          client.setQueryData<ScholarlyCollation[]>(getGetScholarlyCollationQueryKey(sourceId), old =>
            old?.map(item => item.passageId === c.passageId ? {
              ...item,
              geometryStates: item.geometryStates.map(s => s.excerptId === selected ? data.state! : s),
              geometry: [...item.geometry.filter(g => g.excerptId !== selected),
                ...(data.state!.current?.rectangles.length ? [data.state!.current] : [])],
            } : item));
          void client.invalidateQueries({ queryKey: getGetScholarlyCollationQueryKey(sourceId) });
          return;
        }
        if ([401, 403].includes(errorStatus(e) ?? 0)) setState({ err: tr("انتهت صلاحية المراجعة؛ لا يمكن عرض الدليل.") });
        if (errorStatus(e) === 409 || errorStatus(e) === 503) {
          setState({ err: tr("الدليل غير متاح أو تغير؛ أعد تحميله قبل التوثيق.") });
          void client.invalidateQueries({ queryKey: getGetScholarlyCollationQueryKey(sourceId) });
        }
        setMessage(tr("لم يُحفظ التوثيق. أعد تحميل الدليل أو تحقق من صلاحيتك."));
      }
    } finally { if (active.current) setBusy(false); }
  }
  if (state.err) return <div role="alert" className="rounded-xl border p-3 font-ui text-sm">
    <p>{state.err}</p><button type="button" className={btnGhost} onClick={() => setTick(t => t + 1)}>{tr("إعادة المحاولة")}</button>
  </div>;
  if (!state.url) return <div className="skel h-40 w-full" aria-busy="true" />;
  const point = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) };
  };
  return <div className="space-y-2 font-ui text-sm">
    <p>{tr("التظليل دليل يدوي لمقتطف واحد فقط. بقية الصفحة مستبعدة، ولا يثبت التظليل صحة النص أو الحقوق.")}</p>
    {c.excerpts.length > 0 && <>
      <label className="block">{tr("المقتطف المرتبط بالحدود")}<select className={field} value={selected} disabled={busy} onChange={e => { setSelected(e.target.value); setEditing(false); resetEditor(); }} data-testid="select-geometry-excerpt">
          {c.excerpts.map(x => <option key={x.id} value={x.id}>{x.id} — {x.originalText.slice(0, 75)}</option>)}
        </select>
      </label>
      <p className="whitespace-pre-wrap font-arabic">{excerpt?.originalText}</p>
      {!editing && <p>{saved ? fmt("حدود موثقة بصريًا بتاريخ {a} — {b}", "Boundaries visually verified on {a} — {b}", { a: new Date(saved.recordedAt).toLocaleString(intlTag()), b: saved.note }) : tr("لا حدود صورة موثقة لهذا المقتطف؛ لا يُستنتج موضعه من النص.")}</p>}
      <button type="button" className={btnGhost} disabled={busy} onClick={() => { resetEditor(); setEditing(!editing); }}>{editing ? tr("إلغاء التعديل") : saved ? tr("تعديل الحدود أو سحبها") : tr("توثيق الحدود يدويًا")}</button>
      <button type="button" className={btnGhost} aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}>{historyOpen ? tr("إخفاء تاريخ الحدود") : tr("عرض تاريخ الحدود")}</button>
    </>}
    <button type="button" className={btnGhost} onClick={() => setZoom(!zoom)} aria-pressed={zoom}>{zoom ? tr("ملاءمة الصورة") : tr("تكبير الصورة لفحص الحروف")}</button>
    <div className="max-h-[32rem] overflow-auto rounded-xl border bg-background" dir="ltr">
      <div className={`relative ${zoom ? 'w-[200%]' : 'w-full'}`} style={{ touchAction: editing ? 'none' : 'auto' }}
        onPointerDown={e => { if (!editing || busy || e.button !== 0) return; start.current = point(e); e.currentTarget.setPointerCapture(e.pointerId); setBox(emptyBox); setConfirmed(false); }}
        onPointerMove={e => { if (!start.current) return; const p = point(e); const a = start.current; setBox({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), width: Math.abs(p.x - a.x), height: Math.abs(p.y - a.y) }); }}
        onPointerUp={() => { start.current = null; }}
        onPointerCancel={() => { start.current = null; setBox(emptyBox); }}>
        <img src={state.url} alt={tr("صورة الأصل الخاصة بهذا المقطع للمراجعة الداخلية")} draggable={false} className="block w-full" data-testid={`img-collation-${c.passageId}`} />
        {conflict?.current?.rectangles.map((r, i) =>
          <div key={`latest-${i}`} className="pointer-events-none absolute border-2 border-amber-600 bg-amber-400/25"
            style={boxStyle(r)} data-testid="geometry-conflict-current" />)}
        {(editing ? [...boxes, ...(validBox ? [box] : [])] : saved?.rectangles ?? []).map((r, i) =>
          <div key={i} className={`pointer-events-none absolute border-2 ${editing ? 'border-dashed border-blue-600 bg-blue-400/20' : 'border-amber-600 bg-amber-400/25'}`}
            style={boxStyle(r)} data-testid={editing ? 'geometry-draft' : 'geometry-verified'} />)}
      </div>
    </div>
    {historyOpen && selected && <GeometryHistory key={`${sourceId}:${c.passageId}:${selected}:${c.imageSha256}:${c.originalTextSha256}`}
      sourceId={sourceId} passageId={c.passageId} excerptId={selected} imageUrl={state.url} imageSha256={c.imageSha256!}
      onDenied={() => setState({ err: tr("انتهت صلاحية المراجعة؛ لا يمكن عرض الدليل.") })} />}
    {editing && <fieldset disabled={busy} className="space-y-2 rounded-xl border p-3">
      <legend>{tr("توثيق مستقل بقراءة الصورة")}</legend>
      {conflict && <div role="alert" className="space-y-2 rounded-xl border p-3" data-testid="geometry-conflict">
        <p>{tr("عدّل مراجع آخر الحدود أو سحبها. الأزرق مسودتك المحفوظة، والكهرماني التوثيق الأحدث.")}</p>
        <p>{conflict.current
          ? `${conflict.current.rectangles.length ? tr("أحدث حدود موثقة") : tr("سُحبت الحدود")} — ${new Date(conflict.current.recordedAt).toLocaleString(intlTag())} — ${conflict.current.note}`
          : tr("التوثيق الأحدث لا يطابق دليل المقتطف الحالي؛ لا حدود صالحة للعرض.")}</p>
        <button type="button" className={btnGhost} data-testid="button-acknowledge-geometry-conflict"
          onClick={() => { setExpectedRevision(conflict.revision); setConflict(null); setConfirmed(false); setMessage(tr("راجعت التوثيق الأحدث؛ أعد تأكيد الفحص البصري قبل حفظ مسودتك أو سحب الحدود.")); }}>{tr("راجعت التوثيق الأحدث؛ متابعة بمسودتي")}</button>
      </div>}
      <p>{tr("اسحب على الصورة لتحديد المقتطف فقط، أو أدخل نسب الحدود من أعلى يسار الصورة. الأزرق مسودة غير موثقة؛ لا تحدد كامل الصفحة.")}</p>
      <div className="grid grid-cols-2 gap-2" dir="ltr">
        {(['x', 'y', 'width', 'height'] as const).map(k => <label key={k}>{({ x: tr("يسار %"), y: tr("أعلى %"), width: tr("عرض %"), height: tr("ارتفاع %") })[k]}
          <input type="number" className={field} min={0} max={100} step="0.01" value={Math.round(box[k] * 10000) / 100} data-testid={`input-geometry-${k}`}
            onChange={e => { setBox(old => ({ ...old, [k]: Number(e.target.value) / 100 })); setConfirmed(false); }} />
        </label>)}
      </div>
      <button type="button" className={btnGhost} disabled={!validBox || boxes.length >= 19} onClick={() => { setBoxes(old => [...old, box]); setBox(emptyBox); setConfirmed(false); }}>{tr("إضافة جزء آخر من المقتطف")}</button>
      <button type="button" className={btnGhost} onClick={() => { setBoxes([]); setBox(emptyBox); setConfirmed(false); }}>{tr("مسح مسودة الحدود")}</button>
      <label className="block">{tr("وصف ما فُحص وحدود الاستبعاد أو سبب السحب")}<textarea className={field} value={note} maxLength={2000} data-testid="input-geometry-note" onChange={e => setNote(e.target.value)} />
      </label>
      <label className="flex gap-2"><input type="checkbox" checked={confirmed} data-testid="checkbox-geometry-confirm" onChange={e => setConfirmed(e.target.checked)} />{tr("فحصت الصورة بصريًا؛ الحدود للمقتطف المختار فقط، أو أؤكد سحب توثيقه. لا اعتماد علمي ولا إخلاء حقوق.")}</label>
      <button type="button" className={btnGhost} data-testid="button-save-geometry" disabled={!!conflict || invalidDraft || !confirmed || note.trim().length < 10 || (!boxes.length && !validBox) || boxes.length + (validBox ? 1 : 0) > 20} onClick={() => void save()}>{tr("حفظ التوثيق البصري")}</button>
      {saved && <button type="button" className={btnGhost} disabled={!!conflict || !confirmed || note.trim().length < 10} data-testid="button-revoke-geometry" onClick={() => void save(true)}>{tr("سحب التظليل الموثق")}</button>}
    </fieldset>}
    {message && <p role="status">{message}</p>}
  </div>;
}
