import { tr } from '@/lib/i18n';
import { LocaleSwitch } from '@/components/mateen/LocaleSwitch';
import { type ReactNode } from 'react';
import { Link } from 'wouter';
import { BookOpen, ScrollText, ShieldCheck } from 'lucide-react';
import { Logo, StarMark } from '@/components/mateen/bits';
import BookMascot from '@/components/mateen/book-mascot';
import './auth-frame.css';

const promises = [
  { icon: ScrollText, get text() { return tr("متون موثّقة بمصادرها، تُقرأ كما كُتبت."); } },
  { icon: BookOpen, get text() { return tr("خطة دراسة تبدأ من حيث توقفت."); } },
  { icon: ShieldCheck, get text() { return tr("حسابك خاص بك، وتقدّمك محفوظ."); } },
];

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mateen-auth" data-testid="auth-frame">
      <div className="mateen-auth__wash" aria-hidden="true" />
      <header className="mateen-auth__top">
        <Link href="/" className="mateen-auth__home" data-testid="link-auth-home" aria-label={tr("العودة إلى صفحة مَتِين الرئيسية")}>
          <Logo className="h-10 sm:h-11" />
        </Link>
        <LocaleSwitch />
      </header>

      <main className="mateen-auth__grid">
        <section className="mateen-auth__welcome" aria-labelledby="auth-welcome-title">
          <div className="mateen-auth__greeting">
            <BookMascot size={88} mood="cheer" pose="wave" className="mateen-auth__mascot" />
            <div>
              <p className="mateen-auth__eyebrow">{tr("أهلاً بك في مَتِين")}</p>
              <h1 id="auth-welcome-title" className="mateen-auth__title">{tr("رفيقك الهادئ إلى المتون")}</h1>
            </div>
          </div>

          <figure className="mateen-auth__folio">
            <StarMark size={260} className="mateen-auth__folio-star" />
            <span className="mateen-auth__folio-mark" aria-hidden="true">{tr("١")}</span>
            <blockquote lang="ar" dir="rtl" className="hadith-text mateen-auth__hadith">إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى</blockquote>
            <figcaption className="mateen-auth__source">{tr("من الأربعين النووية، الحديث الأول")}</figcaption>
          </figure>

          <ul className="mateen-auth__promises">
            {promises.map(({ icon: Icon, text }) => (
              <li key={text}><span className="mateen-auth__promise-icon"><Icon size={16} strokeWidth={2.2} /></span>{text}</li>
            ))}
          </ul>
        </section>

        <section className="mateen-auth__form" aria-label={tr("نموذج الحساب")}>
          <div className="mateen-auth__form-inner">{children}</div>
          <p className="mateen-auth__fineprint">{tr("فضاء لدراسة المتون على نصوص موثّقة بمصادرها، بلا وعود لا تتحقق.")}</p>
        </section>
      </main>
    </div>
  );
}
