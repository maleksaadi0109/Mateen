import { type ReactNode } from 'react';
import { Link } from 'wouter';
import { Logo, StarMark } from '@/components/mateen/bits';

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[1fr_1.1fr]">
      <div className="relative hidden overflow-hidden bg-primary p-14 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="star-pattern absolute inset-0 opacity-60" />
        <StarMark size={520} className="spin-slow absolute -bottom-40 -left-40 text-primary-foreground/10" />
        <Link href="/" className="relative z-10 w-fit rounded-2xl bg-background px-5 py-3"><Logo className="h-12" /></Link>
        <div className="relative z-10 max-w-md">
          <p className="hadith-text text-3xl leading-[2.1]">إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى</p>
          <p className="mt-4 font-ui text-sm opacity-80">من الأربعين النووية، الحديث الأول</p>
          <p className="mt-10 font-arabic text-lg leading-loose opacity-90">فضاء لدراسة المتون على نصوص موثّقة بمصادرها، بلا وعود لا تتحقق.</p>
        </div>
      </div>
      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full">
          <Link href="/" className="mx-auto mb-6 block w-fit lg:hidden"><Logo className="h-12" /></Link>
          {children}
        </div>
      </div>
    </div>
  );
}
