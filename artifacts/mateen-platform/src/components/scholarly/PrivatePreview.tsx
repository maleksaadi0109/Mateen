import { useState } from 'react';
import { useAuth } from '@clerk/react';
import { useGenerateScholarlyPreview } from '@workspace/api-client-react';
import { Notice } from '@/components/mateen/bits';

function previewError(error: unknown): string {
  const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : null;
  if (status === 401 || status === 403) return 'انتهت الجلسة أو لم تعد مخوّلة. ادخل بجلسة إدارة مؤمّنة ثم أعد المحاولة.';
  if (status === 429) return 'وصلت إلى الحد المسموح للتجربة. انتظر دقيقة قبل إعادة المحاولة.';
  if (status === 400) return 'اكتب سؤالاً بين ٣ و٢٠٠٠ حرف.';
  return 'تعذّر توليد المسودة من NVIDIA. لم تتغير حالة المساعد أو التقييم؛ يمكنك إعادة المحاولة.';
}

export default function PrivatePreview() {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  if (!isLoaded || !isSignedIn || !userId || !sessionId) return null;
  // Remount before rendering another account/session: drafts and pending
  // mutation observers must never be inherited across identity changes.
  return <SessionPreview key={JSON.stringify([userId, sessionId])} />;
}

function SessionPreview() {
  const [question, setQuestion] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const preview = useGenerateScholarlyPreview({ mutation: { gcTime: 0 } });
  const trimmed = question.trim();
  const valid = trimmed.length >= 3 && question.length <= 2000;
  const clear = () => {
    preview.reset();
    setQuestion('');
    setSubmittedQuestion('');
  };

  return (
    <section className="space-y-5" data-testid="private-preview">
      <Notice tone="amber" title="تجربة خاصة — ليست إجابة معتمدة">
        تُولَّد هذه المسودات من NVIDIA دون مصادر موثّقة مقدَّمة للنموذج أو مراجعة علمية مسبقة.
        قد تتضمن أخطاء، ولا تصلح للفتوى أو الاعتماد العلمي. لا تظهر للطلاب ولا تغيّر نتيجة التقييم.
      </Notice>
      <form className="paper-card space-y-4 p-5 sm:p-7" onSubmit={(event) => {
        event.preventDefault();
        if (!valid || preview.isPending) return;
        const sentQuestion = trimmed;
        preview.reset();
        setSubmittedQuestion('');
        preview.mutate({ data: { question: sentQuestion } }, {
          onSuccess: () => setSubmittedQuestion(sentQuestion),
        });
      }}>
        <div>
          <h2 className="font-display text-xl font-bold">تجربة التوليد من NVIDIA</h2>
          <p className="mt-2 font-ui text-sm text-muted-foreground">
            النموذج: NVIDIA Nemotron 3.5 Lightning. لا يلزم وجود مصادر مفهرسة لهذه التجربة وحدها.
          </p>
        </div>
        <label htmlFor="private-preview-question" className="block font-ui text-sm font-bold">السؤال التجريبي</label>
        <textarea id="private-preview-question" dir="rtl" value={question} rows={5}
          disabled={preview.isPending} maxLength={2000} aria-describedby="private-preview-privacy"
          onChange={(event) => setQuestion(event.target.value)}
          className="w-full min-w-0 rounded-xl border bg-background p-3 font-arabic text-lg leading-loose outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:opacity-60"
          placeholder="اكتب سؤالاً لتجربة صياغة النموذج…" data-testid="input-private-preview-question" />
        <p id="private-preview-privacy" className="font-ui text-xs leading-relaxed text-muted-foreground">
          لا تضع بيانات شخصية أو أسئلة خاصة بالطلاب. يُرسل السؤال إلى NVIDIA.
          لا تُحفظ الأسئلة أو المسودات في قاعدة بيانات مَتِين؛ يسجَّل حدوث التجربة فقط دون محتواها.
          تُمسح النتيجة عند مغادرة هذا التبويب أو إعادة تحميل الصفحة. الحد: ٥ طلبات في الدقيقة.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={!valid || preview.isPending}
            className="min-h-11 rounded-full bg-primary px-6 py-2.5 font-ui text-sm font-bold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:opacity-50"
            data-testid="button-generate-private-preview">
            {preview.isPending ? 'جارٍ التوليد من NVIDIA…' : 'توليد مسودة خاصة'}
          </button>
          <button type="button" onClick={clear} disabled={preview.isPending}
            className="min-h-11 rounded-full border px-6 py-2.5 font-ui text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:opacity-50"
            data-testid="button-clear-private-preview">مسح السؤال والنتيجة</button>
        </div>
        {preview.isPending && <p role="status" className="font-ui text-sm text-muted-foreground">قد يستغرق الطلب نحو دقيقة. لا تُغلق الصفحة أثناء التوليد.</p>}
        {preview.isError && <p role="alert" className="font-ui text-sm text-destructive" data-testid="error-private-preview">{previewError(preview.error)}</p>}
      </form>
      {preview.data && (
        <article className="paper-card space-y-4 p-5 sm:p-7" data-testid="result-private-preview">
          <h3 className="font-display text-xl font-bold">مسودة مولّدة غير مراجعة</h3>
          <p className="break-words font-ui text-xs text-muted-foreground">النموذج: {preview.data.model}</p>
          <div className="rounded-xl bg-muted p-3">
            <p className="font-ui text-xs font-bold">السؤال الذي أُرسل</p>
            <p className="mt-1 whitespace-pre-wrap break-words font-arabic">{submittedQuestion}</p>
          </div>
          <p dir="rtl" className="whitespace-pre-wrap break-words font-arabic text-xl leading-loose">{preview.data.answer}</p>
          <p className="border-t pt-3 font-ui text-xs text-muted-foreground">
            بلا استشهادات موثّقة، وبلا اعتماد علمي. لا تُحسب هذه النتيجة اجتيازاً للتقييم.
          </p>
        </article>
      )}
    </section>
  );
}