import { useRef, useState } from 'react';
import { Mic, Square, Trash2, Save, UploadCloud } from 'lucide-react';
import {
  useSaveAssessmentAnswer, useRequestAssessmentAudio, useConfirmAssessmentAudio, useDeleteAssessmentAudio,
} from '@workspace/api-client-react';
import type { AnswerAcknowledgement, AssessmentQuestion } from '@workspace/api-client-react';
import { useRecitationRecorder } from '@/hooks/use-recitation-recorder';
import { questionAnchor, clearDraft, errorMessage, loadDraft, mutationIdFor, nextSequence, saveDraft } from '@/lib/assessment';
import { num } from '@/lib/mateen';
import { createAssessmentAudioUpload } from '@/lib/assessment-audio-upload';

type Props = { index: number; onFocusQuestion: (i: number) => void; attemptId: string; sessionId: string; q: AssessmentQuestion; disabled: boolean; onChanged: () => void };

export function ExamQuestion({ index, onFocusQuestion, attemptId, sessionId, q, disabled, onChanged }: Props) {
  const [text, setText] = useState(() => loadDraft(localStorage, attemptId, q.id, q.writtenAnswer));
  const ids = useRef(new Map<string, string>());
  const audioUpload = useRef(createAssessmentAudioUpload<AnswerAcknowledgement>());
  const audioBusy = useRef(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const rec = useRecitationRecorder();
  const save = useSaveAssessmentAnswer();
  const request = useRequestAssessmentAudio();
  const confirm = useConfirmAssessmentAudio();
  const del = useDeleteAssessmentAudio();
  const seq = nextSequence(q);

  const saveWritten = async () => {
    setMsg(null);
    try {
      const ack = await save.mutateAsync({ attemptId, questionId: q.id, data: { sessionId, sequence: seq, mutationId: mutationIdFor(ids.current, seq, text), writtenAnswer: text } });
      if (ack.acknowledged) clearDraft(localStorage, attemptId, q.id);
      setMsg(ack.acknowledged ? 'أقرّ الخادم بحفظ إجابتك.' : 'لم يُقرّ الخادم بالحفظ بعد. أعد المحاولة.');
      onChanged();
    } catch (e) { setMsg(errorMessage(e, 'تعذّر الحفظ. إجابتك ما زالت هنا؛ أعد المحاولة.')); }
  };

  const sendAudio = async () => {
    if (!rec.blob || !consent || audioBusy.current || disabled) return;
    audioBusy.current = true;
    setBusy(true); setMsg(null);
    try {
      const blob = rec.blob;
      const ack = await audioUpload.current.send({
        blob, sequence: seq,
        allocate: (sequence) => request.mutateAsync({ attemptId, questionId: q.id, data: { sessionId, sequence, contentType: blob.type, sizeBytes: blob.size, durationSeconds: Math.min(60, Math.max(1, rec.seconds)), consent: true } }),
        put: async (up, audio) => {
          const result = await fetch(up.uploadUrl, { method: 'PUT', credentials: 'omit', headers: { 'Content-Type': audio.type }, body: audio });
          if (!result.ok) throw new Error('تعذّر رفع الملف؛ التسجيل محفوظ محلياً لإعادة المحاولة.');
        },
        confirm: (sequence) => confirm.mutateAsync({ attemptId, questionId: q.id, data: { sessionId, sequence } }),
        cancel: () => del.mutateAsync({ attemptId, questionId: q.id }),
      });
      setMsg(ack.acknowledged ? 'وصل تسجيلك وأقرّ الخادم باستلامه.' : 'لم يُقرّ الخادم بالاستلام.');
      if (ack.acknowledged) { rec.discard(); setConsent(false); onChanged(); }
    } catch (e) { setMsg(errorMessage(e, 'تعذّر رفع التسجيل. يمكنك إعادة المحاولة بنفس التسجيل.')); }
    finally { audioBusy.current = false; setBusy(false); }
  };

  const removeAudio = async () => {
    if (audioBusy.current) return;
    audioBusy.current = true;
    setBusy(true); setMsg(null);
    try { await del.mutateAsync({ attemptId, questionId: q.id }); audioUpload.current.reset(); setConsent(false); setMsg('أزيل التسجيل من هذا السؤال. تُستكمل إزالة نسخة الرفع المؤقتة بعد انتهاء رابطها، ولا تبقى متاحة للتقييم.'); onChanged(); }
    catch (e) { setMsg(errorMessage(e, 'تعذّر الحذف. أعد المحاولة.')); }
    finally { audioBusy.current = false; setBusy(false); }
  };

  const startAudio = async () => {
    if (audioBusy.current || disabled) return;
    audioBusy.current = true; setBusy(true); setMsg(null);
    try {
      if (audioUpload.current.hasPending()) {
        await del.mutateAsync({ attemptId, questionId: q.id });
        audioUpload.current.reset();
        onChanged();
      }
      setConsent(false);
      await rec.start();
    } catch (e) { setMsg(errorMessage(e, 'تعذّر إلغاء الرفع السابق؛ احتفظنا بالتسجيل لإعادة المحاولة.')); }
    finally { audioBusy.current = false; setBusy(false); }
  };

  return (
    <li id={questionAnchor(index)} tabIndex={-1} aria-label={`السؤال ${q.position}`} onFocusCapture={() => onFocusQuestion(index)} onPointerDown={() => onFocusQuestion(index)} className="paper-card scroll-mt-24 p-5 outline-none" data-testid={`exam-q-${q.position}`}>
      <p className="font-ui text-xs font-bold text-secondary">{num(q.position)} · {q.kind === 'written' ? 'تحريري' : 'شفوي'}</p>
      <p className="mt-2 font-arabic text-xl leading-10">{q.prompt}</p>
      {q.kind === 'written' ? (
        <div className="mt-4 space-y-2">
          <textarea dir="rtl" value={text} onChange={(e) => { setText(e.target.value); saveDraft(localStorage, attemptId, q.id, e.target.value); }} disabled={disabled} rows={4} maxLength={20000}
            className="w-full rounded-xl border bg-background p-3 font-arabic text-lg leading-9 disabled:opacity-50" aria-label={`إجابة السؤال ${q.position}`} />
          <button onClick={saveWritten} disabled={disabled || !text.trim() || save.isPending} className="inline-flex items-center gap-2 rounded-full bg-secondary px-5 py-2 font-ui text-sm font-bold text-secondary-foreground disabled:opacity-50">
            <Save size={15} /> {save.isPending ? 'جارٍ الحفظ...' : 'احفظ الإجابة'}
          </button>
          {q.answerSequence > 0 && <p className="font-ui text-xs text-muted-foreground">حُفظت إجابة سابقة على الخادم؛ حفظ جديد يستبدلها.</p>}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="font-ui text-xs leading-6 text-muted-foreground">الحد الأقصى للتسجيل: ٦٠ ثانية وحجم ١٠ ميبيبايت. تُعرض مشكلة تقنية إذا تعذّر تقييم الصوت، ولا تُحتسب درجة آلية منه.</p>
          <p className="font-ui text-sm">{q.audioReceived ? 'استلم الخادم تسجيلاً لهذا السؤال.' : 'لم يُرسل تسجيل بعد.'}</p>
          {rec.audioUrl && <audio controls src={rec.audioUrl} className="w-full" />}
          {rec.error && <p role="alert" className="font-ui text-sm text-secondary">{rec.error}</p>}
          <div className="flex flex-wrap gap-2">
            {(rec.status === 'idle' || rec.status === 'error' || rec.status === 'ready') && (
              <button onClick={startAudio} disabled={disabled || busy} className="inline-flex items-center gap-2 rounded-full border px-4 py-2 font-ui text-sm font-bold disabled:opacity-50"><Mic size={15} /> {rec.status === 'ready' ? 'سجّل من جديد' : 'ابدأ التسجيل'}</button>
            )}
            {rec.status === 'recording' && <button onClick={rec.stop} className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 font-ui text-sm font-bold text-secondary-foreground"><Square size={15} /> إيقاف ({num(rec.seconds)} ث)</button>}
            {q.audioDeletionAvailable && <button onClick={removeAudio} disabled={disabled || busy} className="inline-flex items-center gap-2 rounded-full border px-4 py-2 font-ui text-sm font-bold disabled:opacity-50"><Trash2 size={15} /> احذف التسجيل المرسل</button>}
          </div>
          {rec.status === 'ready' && (
            <div className="space-y-2 rounded-xl border p-3">
              <label className="flex items-start gap-2 font-ui text-xs leading-6">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
                أوافق اختيارياً على إرسال هذا التسجيل خاصاً إلى مراجع بشري للتقييم، بحد ٦٠ ثانية و١٠ ميبيبايت، ويُحتفظ به ٣٠ يوماً ويمكنني حذفه قبل ذلك.
              </label>
              <button onClick={sendAudio} disabled={!consent || busy || disabled} className="inline-flex items-center gap-2 rounded-full bg-secondary px-5 py-2 font-ui text-sm font-bold text-secondary-foreground disabled:opacity-50"><UploadCloud size={15} /> {busy ? 'جارٍ الإرسال...' : 'أرسل التسجيل'}</button>
            </div>
          )}
        </div>
      )}
      {msg && <p role="status" className="mt-3 font-ui text-sm">{msg}</p>}
    </li>
  );
}
