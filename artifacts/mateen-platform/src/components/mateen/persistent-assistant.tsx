import { tr } from '@/lib/i18n';
import { useLocation } from 'wouter';
import { useUser } from '@clerk/react';
import BookMascot from './book-mascot';

/** A reading companion, not a second scientific assistant or an account control. */
export default function PersistentAssistant() {
  const [path] = useLocation();
  const { isSignedIn } = useUser();
  const inPortal = /^\/(student|teacher|admin)(\/|$)/.test(path);
  if (path !== '/' && !(isSignedIn && inPortal)) return null;
  const message = !inPortal ? tr("أهلًا بك في مجلس القراءة")
    : path.startsWith('/teacher') || path.startsWith('/admin') ? tr("رفيقك في مجلس العلم")
    : path.startsWith('/student/word-practice') ? tr("نتدرّب على الكلمات، خطوةً خطوة")
    : path.startsWith('/student/settings') ? tr("اختر ما يناسب رحلتك")
    : path.startsWith('/student/learn') || path.startsWith('/student/study') ? tr("اقرأ بتأنٍّ، وخذ وقتك")
    : tr("أهلًا بعودتك، نكمل رحلتنا معًا");
  return (
      <aside aria-label={tr("مَتِين، رفيق القراءة")} data-testid="persistent-assistant" className="mateen-companion sticky top-0 z-40 h-[var(--mateen-assistant-height)] border-b border-secondary/20 bg-card/95 text-foreground shadow-sm backdrop-blur" dir="rtl">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-center gap-3 px-3 sm:gap-4 sm:px-6">
          <BookMascot size={60} mood="cheer" title={tr("مَتِين، رفيق القراءة")} className="h-14 w-14 sm:h-16 sm:w-16" still />
          <div className="min-w-0">
            <p className="font-ui text-[10px] font-bold text-secondary sm:text-xs">{tr("مَتِين · رفيق القراءة")}</p>
            <p className="mt-0.5 font-ui text-xs font-semibold leading-relaxed sm:text-sm">{message}</p>
          </div>
        </div>
      </aside>
  );
}