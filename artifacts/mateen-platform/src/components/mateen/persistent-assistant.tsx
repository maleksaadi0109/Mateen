import { useLocation } from 'wouter';
import BookMascot from './book-mascot';

/** A permanent, informational companion. No dismiss state or saved visibility preference. */
export default function PersistentAssistant() {
  const [path] = useLocation();
  const studying = /\/student\/(learn|study)(\/|$)/.test(path);
  if (path === '/') {
    return (
      <aside aria-label="مساعد مَتِين" data-testid="persistent-assistant" className="sticky top-0 z-40 h-[var(--mateen-assistant-height)] border-b border-secondary/15 bg-[#f4e7d1]">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-center gap-2 px-4 text-primary">
          <BookMascot size={38} mood="calm" title="مَتِين، رفيق القراءة" still />
          <p className="font-ui text-xs font-bold sm:text-sm">أهلًا بك في مجلس القراءة <span className="font-arabic font-medium text-primary/70">— نمضي في المتن على مهل</span></p>
        </div>
      </aside>
    );
  }
  const tip = path.startsWith('/teacher')
    ? 'إرشادك يعين الطالب على الفهم. تابع الإحالات من صفحة الرسائل.'
    : path.startsWith('/admin')
      ? 'اعتماد المحتوى يحتاج مراجعة المختص، ولا تقوم الإجابات الآلية مقامها.'
      : path.includes('/assistant')
        ? 'اختر كتابك واكتب سؤالك. الإجابات الآلية قد تخطئ.'
        : studying
          ? 'اقرأ بتأنٍّ، وراجع ما يصعب عليك قبل التسميع.'
          : path.includes('/messages')
            ? 'تابع محادثاتك هنا؛ التواصل مع المعلم يكون عبر إحالة وافقت عليها.'
            : path.includes('/tracks')
              ? 'اختر المتن الذي تريد دراسته، وتابع رحلتك خطوة بخطوة.'
              : 'أهلاً بك في مَتِين. قليل دائم من التعلّم خير من كثير منقطع.';

  return (
    <aside
      aria-label="مساعد مَتِين"
      data-testid="persistent-assistant"
      className="sticky top-0 z-40 h-[var(--mateen-assistant-height)] border-b bg-card shadow-sm"
    >
      <div className="mx-auto flex h-full max-w-7xl items-center gap-3 px-4 sm:px-6">
        <BookMascot size={64} still={studying} />
        <div className="min-w-0">
          <p className="font-ui text-xs font-bold text-secondary">مساعد مَتِين</p>
          <p className="line-clamp-2 font-ui text-xs leading-5 text-foreground sm:text-sm" data-testid="persistent-assistant-tip">{tip}</p>
        </div>
      </div>
    </aside>
  );
}