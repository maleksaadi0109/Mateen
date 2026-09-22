import { MateenLanding } from '@/components/MateenLanding';
import { Link, Route, Switch, Router as WouterRouter } from 'wouter';
import { ArrowRight } from 'lucide-react';
import logoPath from '@assets/MateeeeeeeeenLOGO_1790090010886.png';

function AboutPage() {
  return <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center" dir="rtl">
    <img src={logoPath} alt="مَتِين" className="brand-logo mb-5 h-20 w-52 object-contain" />
    <h1 className="font-arabic text-7xl font-bold text-foreground">قريباً</h1>
    <Link href="/" className="mt-8 flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground" data-testid="link-back-home"><ArrowRight size={17}/>العودة للرئيسية</Link>
  </main>;
}

function App() {
  return <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Switch><Route path="/" component={MateenLanding}/><Route path="/about" component={AboutPage}/><Route><MateenLanding/></Route></Switch></WouterRouter>;
}

export default App;
