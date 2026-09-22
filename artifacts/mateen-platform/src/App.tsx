import { MateenLanding } from '@/components/MateenLanding';
import { Link, Route, Switch, Router as WouterRouter } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import logoPath from '@assets/MateeeeeeeeenLOGO_1790090010886.png';

function AboutPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center grain" dir="rtl">
      <img src={logoPath} alt="مَتِين" className="brand-logo mb-10 h-24 w-auto object-contain" />
      <h1 className="font-display text-[5rem] font-bold text-foreground">قريباً</h1>
      <p className="mt-4 text-muted-foreground font-ui mb-10">الصفحة قيد الإنشاء</p>
      
      <Link href="/" className="flex items-center gap-2 rounded-full border border-border bg-card px-8 py-4 font-bold text-foreground transition hover:-translate-y-1 hover:border-primary/30 hover:bg-primary/5 hover:text-primary font-ui" data-testid="link-back-home">
        العودة للرئيسية
        <ArrowLeft size={17} />
      </Link>
    </main>
  );
}

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Switch>
        <Route path="/" component={MateenLanding} />
        <Route path="/about" component={AboutPage} />
        <Route><MateenLanding /></Route>
      </Switch>
    </WouterRouter>
  );
}

export default App;
