import './_group.css';
import logoPath from './logo.png';

function Logo({ className = 'h-12' }: { className?: string }) {
  return <img src={logoPath} alt="مَتِين" className={`brand-logo w-auto object-contain ${className}`} />;
}
function StarMark({ className = '', size = 24 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 72 72" width={size} height={size} className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M36 4l8 13 15-4-4 15 13 8-13 8 4 15-15-4-8 13-8-13-15 4 4-15-13-8 13-8-4-15 15 4z" />
      <circle cx="36" cy="36" r="6" />
    </svg>
  );
}

/** Exact copy of mateen-platform AuthFrame; Clerk form stubbed as a labeled slot. */
export function Current() {
  return (
    <div dir="rtl" className="grid min-h-screen bg-[hsl(var(--background))] lg:grid-cols-[1fr_1.1fr]" style={{ fontFamily: 'Cairo, sans-serif' }}>
      <div className="relative hidden overflow-hidden bg-[hsl(var(--primary))] p-14 text-[hsl(var(--primary-foreground))] lg:flex lg:flex-col lg:justify-between">
        <div className="star-pattern absolute inset-0 opacity-60" />
        <StarMark size={520} className="spin-slow absolute -bottom-40 -left-40 opacity-10" />
        <a href="#" className="relative z-10 w-fit rounded-2xl bg-[hsl(var(--background))] px-5 py-3"><Logo className="h-12" /></a>
        <div className="relative z-10 max-w-md">
          <p className="hadith-text text-3xl leading-[2.1]">إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى</p>
          <p className="mt-4 font-ui text-sm opacity-80">من الأربعين النووية، الحديث الأول</p>
          <p className="mt-10 font-arabic text-lg leading-loose opacity-90">فضاء لدراسة المتون على نصوص موثّقة بمصادرها، بلا وعود لا تتحقق.</p>
        </div>
      </div>
      <div className="mateen-auth-pane flex items-start justify-center px-3 py-6 sm:items-center sm:px-4 sm:py-10">
        <div className="w-full min-w-0">
          <a href="#" className="mx-auto mb-6 block w-fit lg:hidden"><Logo className="h-12" /></a>
          <div className="mx-auto flex h-[520px] w-full max-w-[440px] items-center justify-center rounded-3xl border border-dashed border-[#e6dccf] bg-[#fffdf8] text-sm text-[#6b5a50]">
            موضع نموذج Clerk (SignIn / SignUp)
          </div>
        </div>
      </div>
    </div>
  );
}
