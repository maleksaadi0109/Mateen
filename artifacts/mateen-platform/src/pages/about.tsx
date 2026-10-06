import { intlTag } from '@/lib/i18n';
import { tr } from '@/lib/i18n';
import { Link } from 'wouter';
import { Logo, Ornament, Reveal, StarMark } from '@/components/mateen/bits';
import { usePageMeta } from '@/lib/mateen';
import { LocaleSwitch } from '@/components/mateen/LocaleSwitch';

// i18n-keys: rendered through tr()
const VALUES = [
  ['الأصالة والمرجعية', 'الاعتماد الحصري على كتب الشروح المعتمدة والمحققة مع إرفاق المصدر والصفحة في كل إجابة.'],
  ['السلامة العلمية', 'الامتناع التام عن الإفتاء أو التكهن، والالتزام بحدود النص العلمي وضوابطه الشرعية.'],
  ['الابتكار المسؤول', 'تسخير تقنيات الذكاء الاصطناعي والمعالجة الصوتية لخدمة المحتوى دون المساس بهيبته ورصانته.'],
  ['التكامل البشري', 'الإيمان بأن التقنية أداة مُعينة وليست بديلاً عن الشيخ والمعلم المعتمد.'],
];
// i18n-keys: rendered through tr()
const PILLARS = [
  ['التسميع الصوتي الذكي', 'محرك معالجة مقطعية يستمع لقراءة الطالب ومستواه في حفظ المتن، ويكتشف أخطاء النقص والزيادة والترتيب فورياً.'],
  ['المساعد العلمي الموثق (RAG)', 'محرك إجابة محدد بنطاق كتب الشروح المعتمدة، يقدم إجابات دقيقة ومسندة بأسماء الكتب وأرقام الصفحات.'],
  ['جسر المشايخ', 'نظام إحالة ذكي يربط الطالب بالمعلمين والمختصين المعتمدين عند الحاجة للتقييم المتقدم أو الأسئلة الخارجة عن المصادر.'],
];
// i18n-keys: rendered through tr()
const RULES = [
  ['لا إفتاء ولا اجتهاد', 'يقتصر دور المساعد على شرح ألفاظ المتون بناءً على كتب الشروح المسجلة فقط.'],
  ['التسميع الخاص بالمتون', 'يقتصر محرك التصحيح الصوتي على المتون والمنظومات دون التطرق للنص القرآني الكريم.'],
  ['الإحالة للمختصين', 'أي استفسار خارج نطاق المراجع المعتمدة يُحال تلقائياً إلى البوابة الخاصة بالمشايخ المعتمدين.'],
];

export default function AboutPage() {
  usePageMeta(tr("عن المنصة | مَتِين"), tr("رؤية منصة مَتِين ورسالتها وقيمها وضوابط السلامة العلمية فيها."));
  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="border-b bg-background/90"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 md:px-10"><Link href="/"><Logo className="h-12" /></Link>
        <div className="flex items-center gap-3"><LocaleSwitch compact /><Link href="/" className="font-ui text-sm font-bold text-primary" data-testid="link-back-home">{tr("الرئيسية")}</Link></div></div></header>
      <section className="star-pattern relative overflow-hidden py-24 text-center">
        <StarMark size={620} className="spin-slow pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-secondary/10" />
        <div className="relative mx-auto max-w-3xl px-5"><Reveal><p className="font-ui text-sm font-bold text-secondary">{tr("عن المنصة")}</p>
          <h1 className="mt-4 font-display text-5xl font-extrabold leading-[1.4] text-primary md:text-6xl">{tr("عن منصة مَتِين")}</h1></Reveal></div>
      </section>
      <main className="mx-auto max-w-5xl space-y-24 px-5 pb-24 md:px-10">
        <Reveal><h2 className="font-display text-3xl font-bold text-secondary">{tr("نبذة عن المنصة")}</h2>
          <p className="mt-5 font-arabic text-xl leading-[2.3]"><strong className="font-display">{tr("«مَتِين»")}</strong>{' '}{tr("هي بيئة تعليمية ذكية متكاملة مخصصة لخدمة المتون والمنظومات العلمية الشرعية. نجمع بين أحدث تقنيات المعالجة الصوتية والذكاء الاصطناعي وبين المنهجية العلمية المعتمدة، لنقدم لطالب العلم تجربة تفاعلية تيسر عليه حفظ المتون، ضبط ألفاظها، وفهم معانيها بدقة وموثوقية عالية.")}</p></Reveal>
        <Reveal><Ornament><span className="font-display text-2xl font-bold">{tr("الرؤية والرسالة")}</span></Ornament>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="paper-card p-8"><h3 className="font-display text-2xl font-bold text-primary">{tr("رؤيتنا")}</h3><p className="mt-3 font-arabic text-lg leading-loose">{tr("أن تكون منصة «مَتِين» البيئة الرقمية المرجعية الأولى عالمياً لتيسير ضبط المتون العلمية وفهمها، والنموذج الرائد في توظيف الذكاء الاصطناعي المسند بالسلامة العلمية والإشراف البشري.")}</p></div>
            <div className="paper-card p-8"><h3 className="font-display text-2xl font-bold text-primary">{tr("رسالتنا")}</h3><p className="mt-3 font-arabic text-lg leading-loose">{tr("تمكين طلاب العلم الشرعي والمؤسسات التعليمية من أدوات تقنية متقدمة تدمج بين دقة المعالجة الصوتية للمتون، والتوثيق الحصري من المراجع المحققة، والإحالة الذكية من المساعد العلمي إلى المعلمين والمشايخ المعتمدين.")}</p></div>
          </div></Reveal>
        <Reveal><h2 className="font-display text-3xl font-bold text-secondary">{tr("القيم الجوهرية")}</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">{VALUES.map(([t, d]) => <div key={t} className="rounded-2xl border-s-4 border-secondary bg-card p-6"><h3 className="font-display text-xl font-bold">{tr(t)}</h3><p className="mt-2 font-arabic text-lg leading-loose text-muted-foreground">{tr(d)}</p></div>)}</div></Reveal>
        <Reveal><h2 className="font-display text-3xl font-bold text-secondary">{tr("ركائز المنصة (ماذا نقدم؟)")}</h2>
          <ol className="mt-8 space-y-5">{PILLARS.map(([t, d], i) => <li key={t} className="paper-card flex gap-5 p-7"><span className="font-display text-4xl font-bold text-secondary/60">{(i + 1).toLocaleString(intlTag())}</span><div><h3 className="font-display text-xl font-bold">{tr(t)}</h3><p className="mt-2 font-arabic text-lg leading-loose">{tr(d)}</p></div></li>)}</ol>
          <p className="mt-5 rounded-xl border border-dashed border-secondary/50 p-4 font-arabic text-base leading-loose text-foreground/80">{tr("تنبيه صريح: هذه الركائز هي وجهة المنصة. المتاح الآن في الإصدار الأول هو قراءة «الأربعين النووية» مع العلامات وموضع التوقف؛ أما التسميع الصوتي والمساعد العلمي فلم يُفعَّلا بعد.")}</p></Reveal>
        <Reveal><h2 className="font-display text-3xl font-bold text-secondary">{tr("الضوابط والسلامة العلمية")}</h2>
          <p className="mt-4 font-arabic text-xl leading-loose">{tr("نضع السلامة العلمية في مقدّمة أولوياتنا عبر قواعد حوكمة تقنية صارمة:")}</p>
          <div className="mt-6 space-y-4">{RULES.map(([t, d]) => <div key={t} className="paper-card p-6"><h3 className="font-display text-lg font-bold text-primary">{tr(t)}</h3><p className="mt-1 font-arabic text-lg leading-loose">{tr(d)}</p></div>)}</div></Reveal>
        <Reveal><h2 className="font-display text-3xl font-bold text-secondary">{tr("التحقق والأثر الميداني")}</h2>
          <p className="mt-4 font-arabic text-xl leading-[2.2]">{tr("لم تُبنَ «مَتِين» كفكرة نظرية، بل انطلقت من دراسة ميدانية شملت")}{' '}<strong>{tr("٦١ مستجيباً")}</strong>{' '}{tr("من طلاب العلم الشرعي بالجامعة الإسلامية بالمدينة المنورة وطلاب الجامعات الإسلامية بدولة ليبيا:")}</p>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <div className="rounded-3xl bg-primary p-8 text-primary-foreground"><p className="font-display text-6xl font-extrabold">{tr("٧٨٫٧٪")}</p><p className="mt-3 font-arabic text-lg leading-loose">{tr("أكدوا أن توثيق المصدر الأصلي بوضوح هو شرط الثقة الأول لديهم.")}</p></div>
            <div className="rounded-3xl bg-secondary p-8 text-secondary-foreground"><p className="font-display text-6xl font-extrabold">{tr("٦٣٫٩٪")}</p><p className="mt-3 font-arabic text-lg leading-loose">{tr("أقرّوا بأن نموذج «المساعد العلمي المدمج بإحالة الشيخ» هو الحل المثالي والأنسب لرحلتهم التعليمية.")}</p></div>
          </div></Reveal>
        <Reveal><div className="rounded-3xl border border-secondary/40 bg-card p-10 text-center star-pattern">
          <h2 className="font-display text-3xl font-bold text-primary md:text-4xl">{tr("ابدأ رحلتك في ضبط المتون العلمية اليوم")}</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/#simulator" className="rounded-full bg-secondary px-8 py-3 font-ui font-bold text-secondary-foreground" data-testid="link-about-sim">{tr("جرّب المعاينة التعليمية")}</Link>
            <Link href="/#tracks" className="rounded-full border-2 border-primary/50 px-8 py-3 font-ui font-bold text-primary" data-testid="link-about-tracks">{tr("استكشف المتون المتاحة")}</Link>
          </div></div></Reveal>
      </main>
    </div>
  );
}
