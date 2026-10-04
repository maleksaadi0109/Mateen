import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import BookMascot from '@/components/mateen/book-mascot';

export type Goal = 'memorize' | 'review' | 'both';
export type Minutes = 10 | 15 | 30 | 45 | 60;
export type Answers = { age: number | null; memorized: string; goal: Goal; dailyMinutes: Minutes };

const GOALS: { v: Goal; t: string }[] = [{ v: 'memorize', t: 'أحفظ جديداً' }, { v: 'review', t: 'أراجع ما حفظت' }, { v: 'both', t: 'الأمران معاً' }];
const MINS: Minutes[] = [10, 15, 30, 45, 60];
const NONE = 'لم أحفظ شيئاً بعد';
type Step = 'age' | 'memorized' | 'goal' | 'minutes' | 'summary';
const ORDER: Step[] = ['age', 'memorized', 'goal', 'minutes', 'summary'];

const chip = (on: boolean) => `rounded-full border-2 px-5 py-2.5 font-ui text-sm font-bold transition ${on ? 'border-secondary bg-secondary/10' : 'border-border hover:border-primary/40'}`;

export default function OnboardingAssistant({ name, saving, error, onSave, onBack }: { name: string; saving: boolean; error: boolean; onSave: (a: Answers) => void; onBack: () => void }) {
  const [step, setStep] = useState<Step>('age');
  const [age, setAge] = useState('');
  const [mem, setMem] = useState('');
  const [goal, setGoal] = useState<Goal | null>(null);
  const [mins, setMins] = useState<Minutes | null>(null);
  const [err, setErr] = useState('');
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { head.current?.focus(); }, [step]);

  const prev = () => { setErr(''); const i = ORDER.indexOf(step); i === 0 ? onBack() : setStep(ORDER[i - 1]); };
  const next = (s: Step) => { setErr(''); setStep(s); };
  const ageNum = age.trim() === '' ? null : Number(age);
  const goAge = (skip: boolean) => {
    if (skip) { setAge(''); return next('memorized'); }
    if (ageNum === null || !Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120) return setErr('أدخل عمراً صحيحاً بين ١ و١٢٠، أو تخطَّ السؤال.');
    next('memorized');
  };
  const goMem = (v: string) => {
    const t = v.trim();
    if (!t) return setErr('اكتب ما حفظته، أو اختر «لم أحفظ شيئاً بعد».');
    if (t.length > 1000) return setErr('الجواب أطول من ١٠٠٠ حرف.');
    setMem(t); next('goal');
  };
  const q: Record<Step, string> = {
    age: `أهلاً يا ${name}! أنا مَتِين. كم عمرك؟ سؤال اختياري.`,
    memorized: 'ماذا حفظتَ من المتون أو القرآن حتى الآن؟',
    goal: 'ما هدفك الآن؟',
    minutes: 'كم دقيقة تستطيع أن تخصص كل يوم؟',
    summary: 'هذا ما فهمته منك. راجعه قبل الحفظ.',
  };
  const goalT = GOALS.find((g) => g.v === goal)?.t;
  const full = goal && mins ? { age: ageNum, memorized: mem, goal, dailyMinutes: mins } : null;

  return (
    <div className="paper-card mx-auto w-full max-w-xl p-8 md:p-10" data-testid="form-onboarding-assistant">
      <div className="flex items-start gap-4">
        <BookMascot size={84} mood={step === 'summary' ? 'cheer' : 'calm'} />
        <div className="min-w-0 flex-1">
          <p className="font-ui text-xs text-muted-foreground">الخطوة {ORDER.indexOf(step) + 1} من {ORDER.length}</p>
          <h1 ref={head} tabIndex={-1} className="mt-1 rounded-2xl bg-muted/50 px-4 py-3 font-arabic text-xl leading-loose outline-none">{q[step]}</h1>
        </div>
      </div>
      <div className="mt-6">
        {step === 'age' && (
          <form onSubmit={(e) => { e.preventDefault(); goAge(false); }}>
            <label htmlFor="age" className="font-ui text-sm font-bold">العمر</label>
            <input id="age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} className="mt-2 w-full rounded-xl border bg-background px-4 py-3 font-ui outline-none focus:border-secondary" data-testid="input-age" />
            <div className="mt-4 flex gap-3">
              <button type="submit" className="rounded-full bg-secondary px-6 py-2.5 font-ui font-bold text-secondary-foreground" data-testid="button-age-next">التالي</button>
              <button type="button" onClick={() => goAge(true)} className="rounded-full border px-6 py-2.5 font-ui font-bold" data-testid="button-age-skip">تخطّي</button>
            </div>
          </form>
        )}
        {step === 'memorized' && (
          <form onSubmit={(e) => { e.preventDefault(); goMem(mem); }}>
            <label htmlFor="mem" className="font-ui text-sm font-bold">محفوظاتي</label>
            <textarea id="mem" rows={3} maxLength={1000} value={mem === NONE ? '' : mem} onChange={(e) => setMem(e.target.value)} className="mt-2 w-full rounded-xl border bg-background px-4 py-3 font-arabic outline-none focus:border-secondary" data-testid="input-memorized" />
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="submit" className="rounded-full bg-secondary px-6 py-2.5 font-ui font-bold text-secondary-foreground" data-testid="button-memorized-next">التالي</button>
              <button type="button" onClick={() => goMem(NONE)} className="rounded-full border px-6 py-2.5 font-ui font-bold" data-testid="button-memorized-none">{NONE}</button>
            </div>
          </form>
        )}
        {step === 'goal' && (
          <fieldset><legend className="sr-only">الهدف</legend>
            <div className="flex flex-wrap gap-3">{GOALS.map((g) => <button type="button" key={g.v} aria-pressed={goal === g.v} onClick={() => { setGoal(g.v); next('minutes'); }} className={chip(goal === g.v)} data-testid={`button-goal-${g.v}`}>{g.t}</button>)}</div>
          </fieldset>
        )}
        {step === 'minutes' && (
          <fieldset><legend className="sr-only">الوقت اليومي</legend>
            <div className="flex flex-wrap gap-3">{MINS.map((m) => <button type="button" key={m} aria-pressed={mins === m} onClick={() => { setMins(m); next('summary'); }} className={chip(mins === m)} data-testid={`button-minutes-${m}`}>{m} دقيقة</button>)}</div>
          </fieldset>
        )}
        {step === 'summary' && (
          <div>
            <dl className="divide-y rounded-xl border font-arabic">
              {([['الاسم', name, null], ['العمر', ageNum === null ? 'لم يُذكر' : String(ageNum), 'age'], ['المحفوظ', mem, 'memorized'], ['الهدف', goalT ?? '', 'goal'], ['الوقت اليومي', `${mins} دقيقة`, 'minutes']] as const).map(([k, v, s]) => (
                <div key={k} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0"><dt className="font-ui text-xs text-muted-foreground">{k}</dt><dd className="break-words">{v}</dd></div>
                  {s && <button type="button" onClick={() => next(s)} disabled={saving} className="font-ui text-sm font-bold text-secondary disabled:opacity-50" data-testid={`button-edit-${s}`}>تعديل</button>}
                </div>
              ))}
            </dl>
            <p className="mt-3 font-ui text-xs text-muted-foreground">إجاباتك خاصة بك، ولا تُعدّ درجة موثّقة ولا تفتح محتوى.</p>
            <button type="button" disabled={saving || !full} onClick={() => full && onSave(full)} className="mt-5 w-full rounded-full bg-secondary py-3.5 font-ui font-bold text-secondary-foreground disabled:opacity-50" data-testid="button-onboarding-confirm">{saving ? 'جارٍ الحفظ…' : error ? 'إعادة المحاولة' : 'احفظ وابدأ'}</button>
          </div>
        )}
      </div>
      <div role="alert" aria-live="polite" className="mt-3 min-h-5 font-ui text-sm text-secondary">{err || (error && step === 'summary' ? 'تعذّر حفظ البيانات. إجاباتك محفوظة هنا، حاول مرة أخرى.' : '')}</div>
      <button type="button" onClick={prev} disabled={saving} className="mt-2 inline-flex items-center gap-1.5 font-ui text-sm text-muted-foreground disabled:opacity-50" data-testid="button-previous"><ArrowRight size={14} aria-hidden /> السابق</button>
    </div>
  );
}
