import { tr } from '@/lib/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  analyzeRecitationPractice, deleteRecitationPractice, getGetRecitationPracticeQueryKey, getListRecitationPracticesQueryKey,
  requestRecitationPractice, useDeleteRecitationPractice, useGetRecitationPractice, useListRecitationPractices,
} from '@workspace/api-client-react';
import type { PracticeRecitation } from '@workspace/api-client-react';
import { Mic, Square, Trash2, RotateCcw, ShieldCheck, AlertCircle, UploadCloud, X } from 'lucide-react';
import { useRecitationRecorder, MAX_RECORDING_SECONDS, MAX_RECORDING_BYTES } from '@/hooks/use-recitation-recorder';
import { num } from '@/lib/mateen';
import { cn } from '@/lib/utils';

const TEXT_ID = 'nawawi' as const;
const CT_PATTERN = /^audio\/(webm|ogg|mp4|mpeg)(\s*;\s*codecs=(opus|vorbis|mp4a\.40\.2|mp3))?$/;
const fmt = (s: number) => `${num(Math.floor(s / 60))}:${num(s % 60).toString().padStart(2, tr("٠"))}`;
const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ar'); };

const STATUS_TEXT: Record<string, string> = {
  get idle() { return tr("جاهز للتسجيل."); }, get requesting() { return tr("بانتظار إذن الميكروفون..."); }, get recording() { return tr("جارٍ التسجيل."); },
  get stopping() { return tr("جارٍ إنهاء التسجيل..."); }, get ready() { return tr("اكتمل التسجيل محلياً. استمع إليه أولاً."); }, get error() { return tr("تعذّر التسجيل."); },
};
const REMOTE_STATUS: Record<string, string> = {
  get uploading() { return tr("قيد الرفع"); }, get processing() { return tr("قيد التحليل"); }, get completed() { return tr("اكتمل التحليل التجريبي"); }, get error() { return tr("تعذّر التحليل"); }, get deleted() { return tr("محذوف"); },
};
const KIND: Record<string, string> = {
  get recognized_word_match_not_assessment() { return tr("كلمات متطابقة مع ما سمعه النموذج (ليست نجاحاً ولا تقييماً)"); },
  get possible_omission() { return tr("احتمال سقوط كلمات (يحتاج مراجعة بشرية)"); },
  get unconfirmed_passage_boundary() { return tr("حدّ مقطع غير مؤكد (يحتاج مراجعة بشرية)"); },
  get possible_substitution() { return tr("احتمال إبدال كلمة (يحتاج مراجعة بشرية)"); },
  get possible_extra_words() { return tr("احتمال كلمات زائدة (يحتاج مراجعة بشرية)"); },
  get recognizer_disagreement_not_reader_error() { return tr("اختلاف في التعرّف الآلي وليس خطأً مثبتاً من القارئ"); },
};
const kindFallback = () => tr('مقطع غير مصنّف (يحتاج مراجعة بشرية)');
const isMatch = (k: string) => k === 'recognized_word_match_not_assessment';

type Phase = 'idle' | 'requesting' | 'uploading' | 'analyzing' | 'sent' | 'failed';

function ResultView({ item }: { item: PracticeRecitation }) {
  const res = item.result;
  if (item.status === 'deleted') return <p className="font-ui text-sm">{tr("أُلغي التدريب وحُذفت نتيجته.")}{' '}{item.audioDeleted ? tr("حُذف الصوت من الخادم.") : tr("تنظيف الصوت لم يكتمل بعد؛ سيُعاد تلقائيًا ويمكنك إعادة طلب الحذف.")}</p>;
  if (item.status === 'error') return <p role="alert" className="font-ui text-sm font-semibold text-secondary">{item.error || tr("تعذّر تحليل هذا التسجيل. لا توجد نتيجة.")}</p>;
  if (item.status !== 'completed' || !res) return <p role="status" className="font-ui text-sm" data-testid="text-practice-pending">{REMOTE_STATUS[item.status]}{tr("... لن تُعرض نتيجة قبل اكتمال التحليل.")}</p>;
  return (
    <div className="space-y-4" data-testid="panel-practice-result">
      <p className="rounded-xl border border-secondary/40 p-3 font-ui text-xs leading-6">{tr("نتيجة تجريبية مؤقتة وليست تقييماً. لا درجة ولا نسبة خطأ ولا حكم بأنك أخطأت أو أتقنت. التعرّف الآلي على الكلام العربي قد يخطئ، وكل فرق أدناه مجرد مرشّح يحتاج مراجعة شيخ أو معلم.")}</p>
      <div><h5 className="font-ui text-sm font-bold">{tr("ما فهمه النموذج (نص خام)")}</h5>
        <p dir="rtl" className="mt-1 whitespace-pre-wrap rounded-xl bg-muted p-3 font-arabic leading-9" data-testid="text-practice-transcript">{res.transcript}</p></div>
      <div><h5 className="font-ui text-sm font-bold">{tr("النص المرجعي للحديث")}</h5>
        <p dir="rtl" className="mt-1 whitespace-pre-wrap rounded-xl bg-muted p-3 font-arabic leading-9" data-testid="text-practice-reference">{res.referenceText}</p></div>
      <div><h5 className="font-ui text-sm font-bold">{tr("مقارنة المقاطع (")}{num(res.alignment.spans.length)})</h5>
        <ul className="mt-2 space-y-2" data-testid="list-practice-spans">
          {res.alignment.spans.map((sp, i) => (
            <li key={i} className={cn('rounded-xl border p-3 font-ui text-xs', isMatch(sp.kind) ? 'border-border' : 'border-secondary/50')}>
              <p className="font-bold">{KIND[sp.kind] ?? kindFallback()}{sp.humanReviewRequired && !/مراجعة بشرية|human review/i.test(KIND[sp.kind] ?? '') /* i18n-canonical: matches either locale */ && tr(" - تحتاج مراجعة بشرية")}</p>
              {sp.referenceWords.length > 0 && <p dir="rtl" className="mt-1 font-arabic text-base leading-8"><span className="font-ui text-xs text-muted-foreground">{tr("المرجع:")}{' '}</span>{sp.referenceWords.join(' ')}</p>}
              {sp.recognizedWords.length > 0 && <p dir="rtl" className="font-arabic text-base leading-8"><span className="font-ui text-xs text-muted-foreground">{tr("المسموع:")}{' '}</span>{sp.recognizedWords.join(' ')}</p>}
            </li>
          ))}
        </ul></div>
      <p className="font-ui text-xs text-muted-foreground">{tr("النموذج:")}{' '}{res.model} ({res.modelRevision}{tr("). الصوت")}{' '}{item.audioDeleted ? tr("حُذف من الخادم") : tr("سيُحذف من الخادم بعد التحليل أو خلال ٢٤ ساعة")}{tr(". هذا لا يغيّر تقدمك.")}</p>
    </div>
  );
}

export default function RecitationRecorder({ hadithNumber }: { hadithNumber: number }) {
  const r = useRecitationRecorder();
  const qc = useQueryClient();
  const [consent, setConsent] = useState(false);
  const [sendConsent, setSendConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [sendError, setSendError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [delError, setDelError] = useState<string | null>(null);
  const alive = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const remoteIdRef = useRef<string | null>(null);
  const discardRef = useRef(r.discard);
  discardRef.current = r.discard;

  const busy = r.status === 'requesting' || r.status === 'recording' || r.status === 'stopping';
  const canStart = consent && r.supported && (r.status === 'idle' || r.status === 'error');
  const sending = phase === 'requesting' || phase === 'uploading' || phase === 'analyzing';
  const mb = Math.round(MAX_RECORDING_BYTES / 1024 / 1024);
  const btn = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 font-ui text-sm font-bold transition disabled:opacity-40';
  const outline = 'border-2 border-primary/50 text-primary hover:bg-primary/10';

  const list = useListRecitationPractices({ query: { queryKey: getListRecitationPracticesQueryKey(), retry: false } });
  const detail = useGetRecitationPractice(selectedId ?? '', {
    query: {
      enabled: !!selectedId, queryKey: getGetRecitationPracticeQueryKey(selectedId ?? ''), retry: false,
      refetchInterval: (q) => {
        const d = q.state.data as PracticeRecitation | undefined;
        if (!d || q.state.status === 'error' || q.state.dataUpdateCount > 400) return false;
        return d.status === 'processing' || (d.status === 'uploading' && sending) ? 2500 : false;
      },
    },
  });
  const del = useDeleteRecitationPractice();
  const refreshList = useCallback(() => qc.invalidateQueries({ queryKey: getListRecitationPracticesQueryKey() }), [qc]);

  // Unmount (hadith switch / navigation): stop in-flight work and delete any remote item whose upload never finished.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abortRef.current?.abort();
      const id = remoteIdRef.current;
      if (id) { remoteIdRef.current = null; deleteRecitationPractice(id).catch(() => undefined); }
    };
  }, []);

  const cleanupRemote = async () => {
    const id = remoteIdRef.current;
    remoteIdRef.current = null;
    if (id) { try { await deleteRecitationPractice(id); } catch { /* best effort; listed under past attempts */ } void refreshList(); }
  };

  const send = async () => {
    const blob = r.blob;
    if (!blob || !sendConsent || sending) return;
    if (!CT_PATTERN.test(blob.type) || blob.size < 1 || blob.size > MAX_RECORDING_BYTES) {
      setPhase('failed'); setSendError(tr("صيغة التسجيل أو حجمه غير مقبول للتحليل. سجّل من جديد. تسجيلك المحلي ما زال متاحاً.")); return;
    }
    await cleanupRemote();
    const ac = new AbortController();
    abortRef.current = ac;
    setSendError(null); setPhase('requesting');
    try {
      const up = await requestRecitationPractice({ textId: TEXT_ID, hadithNumber, contentType: blob.type, sizeBytes: blob.size, consent: true }, { signal: ac.signal });
      remoteIdRef.current = up.id;
      if (ac.signal.aborted || !alive.current) { await cleanupRemote(); return; }
      const target = new URL(up.uploadUrl);
      if (target.protocol !== 'https:' || target.hostname !== 'storage.googleapis.com' || target.username || target.password) {
        throw new Error('Invalid private upload destination');
      }
      setPhase('uploading');
      const put = await fetch(up.uploadUrl, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob, signal: ac.signal });
      if (!put.ok) throw new Error('upload');
      if (ac.signal.aborted || !alive.current) { await cleanupRemote(); return; }
      setPhase('analyzing');
      await analyzeRecitationPractice(up.id, { signal: ac.signal });
      if (ac.signal.aborted || !alive.current) return;
      remoteIdRef.current = null; // now owned by the past-attempts list
      setSelectedId(up.id); setPhase('sent'); void refreshList();
    } catch {
      if (!alive.current || ac.signal.aborted) return;
      await cleanupRemote();
      setPhase('failed');
      setSendError(tr("تعذّر الإرسال أو التحليل. قد يكون التحليل التجريبي غير متاح الآن. تسجيلك المحلي ما زال عندك ويمكنك إعادة المحاولة أو الاحتفاظ به محلياً. لا توجد نتيجة."));
    }
  };

  const cancelSend = async () => {
    abortRef.current?.abort();
    await cleanupRemote();
    if (alive.current) { setPhase('idle'); setSendError(null); }
  };

  const onDelete = (id: string) => {
    setDelError(null);
    del.mutate({ id }, {
      onSuccess: () => {
        qc.removeQueries({ queryKey: getGetRecitationPracticeQueryKey(id) });
        void refreshList();
        if (selectedId === id) { setSelectedId(null); setPhase('idle'); setSendConsent(false); discardRef.current(); }
      },
      onError: () => {
        void refreshList();
        void qc.invalidateQueries({ queryKey: getGetRecitationPracticeQueryKey(id) });
        setDelError(tr("تعذّر تأكيد اكتمال حذف الصوت. تُحدَّث حالة المحاولة، ويمكنك إعادة طلب الحذف."));
      },
    });
  };

  const discardAll = () => { setPhase('idle'); setSendError(null); setSendConsent(false); r.discard(); };
  const items = (list.data ?? []).filter((x) => x.textId === TEXT_ID && x.status !== 'deleted');

  return (
    <section className="paper-card mt-8 p-5 md:p-6" aria-labelledby="recorder-title" data-testid="section-recorder">
      <h3 id="recorder-title" className="font-display text-xl font-bold">{tr("تدريب تجريبي على التسميع: الحديث")}{' '}{num(hadithNumber)}</h3>
      <p className="mt-2 font-ui text-sm text-muted-foreground">{tr("ميزة تجريبية للتدريب الشخصي. لا تقييم ولا درجة ولا حكم على أدائك، ولا تغيّر تقدمك. لم يتم التحقق من حقوق إعادة استخدام النص أو دقة التعرّف، فاعتبر أي نتيجة مرشّحاً للمراجعة فقط.")}</p>

      <div className="mt-4 flex gap-3 rounded-xl bg-muted p-4 font-ui text-xs leading-6" data-testid="text-recorder-privacy">
        <ShieldCheck size={18} className="mt-1 shrink-0 text-secondary" aria-hidden />
        <div className="space-y-1">
          <p>{tr("التسجيل يبقى في ذاكرة متصفحك ويمكنك الاستماع إليه. لا يُرسل إلا إذا ضغطت بنفسك زر الإرسال بعد موافقة مستقلة. يُتخلص منه محلياً عند تغيير الحديث أو مغادرة الصفحة. يتوقف التسجيل عند مغادرة التبويب. الحد الأقصى")}{' '}{num(MAX_RECORDING_SECONDS)}{' '}{tr("ثانية أو")}{' '}{num(mb)}{' '}{tr("ميغابايت.")}</p>
          <p>{tr("عند الإرسال يُخزَّن الصوت في تخزين خاص ويُحذف بعد التحليل أو خلال ٢٤ ساعة كحد أقصى. قد يُحفظ النص الناتج ونتيجة المقارنة حتى ٢٤ ساعة كحد أقصى، ولك حذفها في أي وقت.")}</p>
        </div>
      </div>

      {!r.supported ? (
        <p role="alert" className="mt-4 flex gap-2 font-ui text-sm font-semibold text-secondary" data-testid="text-recorder-unsupported">
          <AlertCircle size={18} className="shrink-0" aria-hidden />{' '}{tr("متصفحك لا يدعم التسجيل الصوتي. جرّب نسخة حديثة من متصفح آخر على اتصال آمن.")}</p>
      ) : (
        <>
          <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 font-ui text-sm">
            <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); if (!e.target.checked) discardAll(); }} disabled={busy || sending}
              className="mt-1 size-5 shrink-0 accent-[hsl(var(--secondary))]" data-testid="checkbox-recorder-consent" />
            <span>{tr("أوافق على استخدام الميكروفون لتسجيل صوتي في هذا المتصفح. التسجيل محلي ولا يُرسل إلا بخطوة منفصلة أختارها لاحقاً.")}</span>
          </label>

          <div className="mt-4 flex items-center gap-3" data-testid="status-recorder-indicator">
            <span className={cn('size-3 rounded-full', r.status === 'recording' ? 'animate-pulse bg-red-700' : 'bg-muted-foreground/40')} aria-hidden />
            <span className="font-ui text-lg font-bold tabular-nums" data-testid="text-recorder-timer">{fmt(r.seconds)} / {fmt(MAX_RECORDING_SECONDS)}</span>
          </div>
          <p className="sr-only" role="status" aria-live="polite" data-testid="text-recorder-status">{STATUS_TEXT[r.status]}</p>
          <p className="font-ui text-xs text-muted-foreground" aria-hidden>{STATUS_TEXT[r.status]}</p>

          {r.status === 'error' && (
            <div role="alert" className="mt-3 rounded-xl border border-secondary/40 p-3 font-ui text-sm" data-testid="text-recorder-error">
              <p className="font-semibold">{r.error || tr("حدث خطأ غير متوقع. تحقق من إذن الميكروفون في إعدادات المتصفح ثم أعد المحاولة.")}</p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            {r.status !== 'ready' && r.status !== 'recording' && r.status !== 'stopping' && (
              <button onClick={() => void r.start()} disabled={!canStart} className={cn(btn, 'bg-primary text-primary-foreground')} data-testid="button-recorder-start">
                {r.status === 'error' ? <RotateCcw size={17} /> : <Mic size={17} />} {r.status === 'error' ? tr("إعادة المحاولة") : tr("ابدأ التسجيل")}
              </button>
            )}
            {(r.status === 'recording' || r.status === 'stopping') && (
              <button onClick={r.stop} disabled={r.status === 'stopping'} className={cn(btn, 'bg-secondary text-secondary-foreground')} data-testid="button-recorder-stop">
                <Square size={17} />{' '}{tr("إيقاف التسجيل")}</button>
            )}
            {busy && (
              <button onClick={r.discard} className={cn(btn, outline)} data-testid="button-recorder-cancel"><Trash2 size={17} />{' '}{tr("إلغاء وحذف")}</button>
            )}
          </div>

          {r.status === 'ready' && r.audioUrl && (
            <div className="mt-4 space-y-4" data-testid="panel-recorder-playback">
              <audio controls src={r.audioUrl} className="w-full" aria-label={tr("الاستماع إلى تسجيلك")} data-testid="audio-recorder-playback" />

              <div className="rounded-xl border p-4" data-testid="panel-practice-send">
                <h4 className="font-ui text-sm font-bold">{tr("إرسال اختياري للتحليل التجريبي")}</h4>
                <label className="mt-2 flex min-h-11 cursor-pointer items-start gap-3 font-ui text-sm">
                  <input type="checkbox" checked={sendConsent} onChange={(e) => setSendConsent(e.target.checked)} disabled={sending}
                    className="mt-1 size-5 shrink-0 accent-[hsl(var(--secondary))]" data-testid="checkbox-practice-send-consent" />
                  <span>{tr("أوافق على رفع هذا التسجيل إلى تخزين خاص لتحليله تجريبياً. يُحذف الصوت بعد التحليل أو خلال ٢٤ ساعة، وقد يبقى النص والنتيجة حتى ٢٤ ساعة ويمكنني حذفهما.")}</span>
                </label>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button onClick={() => void send()} disabled={!sendConsent || sending || phase === 'sent'} className={cn(btn, 'bg-primary text-primary-foreground')} data-testid="button-practice-send">
                    <UploadCloud size={17} /> {phase === 'failed' ? tr("أعد محاولة الإرسال") : tr("أرسل للتحليل")}
                  </button>
                  {sending && <button onClick={() => void cancelSend()} className={cn(btn, outline)} data-testid="button-practice-cancel"><X size={17} />{' '}{tr("إلغاء الإرسال")}</button>}
                </div>
                {sending && <p role="status" className="mt-2 font-ui text-xs">{phase === 'requesting' ? tr("جارٍ تجهيز الرفع...") : phase === 'uploading' ? tr("جارٍ رفع الصوت...") : tr("جارٍ بدء التحليل...")}</p>}
                {sendError && <p role="alert" className="mt-2 font-ui text-sm font-semibold text-secondary" data-testid="text-practice-send-error">{sendError}</p>}
              </div>

              <button onClick={discardAll} disabled={sending} className={cn(btn, outline)} data-testid="button-recorder-discard">
                <Trash2 size={17} />{' '}{tr("حذف التسجيل المحلي لتسجيل جديد")}</button>
            </div>
          )}
        </>
      )}

      <div className="mt-6 border-t pt-5" data-testid="panel-practice-history">
        <h4 className="font-display text-lg font-bold">{tr("محاولاتي السابقة (تجريبية، تُحذف خلال ٢٤ ساعة)")}</h4>
        {list.isLoading && <div className="mt-3 h-12 animate-pulse rounded-xl bg-muted" aria-label={tr("جارٍ التحميل")} />}
        {list.isError && (
          <div role="alert" className="mt-3 font-ui text-sm" data-testid="text-practice-unavailable">
            <p>{tr("تعذّر تحميل المحاولات، وقد يكون التحليل التجريبي غير متاح الآن. التسجيل المحلي يعمل بدون خادم التحليل ولا تظهر أي نتيجة زائفة.")}</p>
            <button onClick={() => void list.refetch()} className="mt-2 rounded-full border px-4 py-2 font-bold">{tr("إعادة المحاولة")}</button>
          </div>
        )}
        {list.isSuccess && items.length === 0 && <p className="mt-3 font-ui text-sm text-muted-foreground">{tr("لا توجد محاولات محفوظة على الخادم. التسجيلات المحلية التي لم ترسلها غير ظاهرة هنا.")}</p>}
        {delError && <p role="alert" className="mt-3 font-ui text-sm font-semibold text-secondary" data-testid="text-practice-delete-error">{delError}</p>}
        <ul className="mt-3 space-y-2">
          {items.map((x) => (
            <li key={x.id} className={cn('flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 font-ui text-sm', selectedId === x.id && 'border-secondary')}>
              <span>{tr("الحديث")}{' '}{num(x.hadithNumber)} - {REMOTE_STATUS[x.status]} - {when(x.createdAt)}</span>
              <span className="flex gap-2">
                <button onClick={() => { setSelectedId(selectedId === x.id ? null : x.id); setDelError(null); }} aria-pressed={selectedId === x.id} className="rounded-full border px-4 py-2 font-bold" data-testid={`button-practice-open-${x.id}`}>{selectedId === x.id ? tr("إخفاء") : tr("عرض")}</button>
                <button onClick={() => onDelete(x.id)} disabled={del.isPending} className="rounded-full border px-4 py-2 font-bold text-secondary disabled:opacity-40" data-testid={`button-practice-delete-${x.id}`}>{del.isPending && del.variables?.id === x.id ? tr("جارٍ الحذف...") : tr("حذف من الخادم")}</button>
              </span>
            </li>
          ))}
        </ul>
        {selectedId && (
          <div className="mt-4" data-testid="panel-practice-detail">
            {detail.isLoading && <div className="h-24 animate-pulse rounded-xl bg-muted" />}
            {detail.isError && <div role="alert" className="font-ui text-sm"><p>{tr("تعذّر تحميل هذه المحاولة. قد تكون حُذفت.")}</p><button onClick={() => void detail.refetch()} className="mt-2 rounded-full border px-4 py-2 font-bold">{tr("إعادة المحاولة")}</button></div>}
            {detail.data && <ResultView item={detail.data} />}
             {detail.data?.status === 'deleted' && !detail.data.audioDeleted && (
               <button onClick={() => onDelete(selectedId)} disabled={del.isPending} className={cn(btn, outline, 'mt-3')} data-testid="button-practice-retry-delete">{tr("إعادة طلب حذف الصوت")}</button>
             )}
          </div>
        )}
      </div>
    </section>
  );
}
