import { tr } from '@/lib/i18n';
import { LocaleSwitch } from '@/components/mateen/LocaleSwitch';
import { Link } from 'wouter';
import { Logo, StarMark } from '@/components/mateen/bits';
import { usePageMeta } from '@/lib/mateen';

export default function NotFound() {
  usePageMeta(tr("الصفحة غير موجودة | مَتِين"), tr("تعذر العثور على الصفحة المطلوبة."));
  return (
    <main className="star-pattern grid min-h-[100dvh] place-items-center bg-background px-6 text-center">
      <div>
        <div className="mb-6 flex justify-center"><LocaleSwitch /></div>
        <Logo className="mx-auto mb-8 h-16" />
        <StarMark size={64} className="mx-auto mb-4 text-secondary" />
        <h1 className="font-display text-5xl font-bold">{tr("٤٠٤")}</h1>
        <p className="mt-4 font-arabic text-xl text-muted-foreground">{tr("لم نجد هذه الصفحة بين الأوراق.")}</p>
        <Link href="/" className="mt-8 inline-block rounded-full bg-primary px-8 py-3 font-ui font-bold text-primary-foreground" data-testid="link-home">{tr("العودة إلى الرئيسية")}</Link>
      </div>
    </main>
  );
}
