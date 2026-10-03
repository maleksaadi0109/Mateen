/** Render source excerpts as escaped text. Only our two exact external
 * reference URL shapes become links; arbitrary student/model URLs stay text. */
export function AnswerText({ text, className, testId }: {
  text: string; className?: string; testId?: string;
}) {
  return (
    <div className={className} data-testid={testId} dir="rtl">
      {text.split('\n').map((line, index) => {
        const reference = line.match(/^رابط المرجع: (https:\/\/shamela\.ws\/book\/(?:21812|11325)\/[1-9]\d{0,2})$/);
        return reference ? (
          <p key={index}>
            <a href={reference[1]} target="_blank" rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center break-words font-ui text-sm font-bold text-secondary underline underline-offset-4"
              data-testid="link-commentary-reference">
              فتح موضع المقتطف في المكتبة الشاملة
            </a>
          </p>
        ) : <p key={index} className="min-w-0 whitespace-pre-wrap break-words">{line || '\u00a0'}</p>;
      })}
    </div>
  );
}