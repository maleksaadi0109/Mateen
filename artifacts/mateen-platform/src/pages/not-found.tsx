import { Link } from 'wouter';
import { Logo, StarMark } from '@/components/mateen/bits';
import { usePageMeta } from '@/lib/mateen';

export default function NotFound() {
  usePageMeta('الصفحة غير موجودة | مَتِين', 'تعذر العثور على الصفحة المطلوبة.');
  return (
    <main className="star-pattern grid min-h-[100dvh] place-items-center bg-background px-6 text-center">
      <div>
        <Logo className="mx-auto mb-8 h-16" />
        <StarMark size={64} className="mx-auto mb-4 text-secondary" />
        <h1 className="font-display text-5xl font-bold">٤٠٤</h1>
        <p className="mt-4 font-arabic text-xl text-muted-foreground">لم نجد هذه الصفحة بين الأوراق.</p>
        <Link href="/" className="mt-8 inline-block rounded-full bg-primary px-8 py-3 font-ui font-bold text-primary-foreground" data-testid="link-home">العودة إلى الرئيسية</Link>
      </div>
    </main>
  );
}
