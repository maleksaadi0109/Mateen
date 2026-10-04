import { useState } from 'react';
import type { Profile, LearningPreferences, useSaveProfile } from '@workspace/api-client-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const GOALS = { memorize: 'أحفظ جديداً', review: 'أراجع ما حفظت', both: 'الأمران معاً' } as const;
const MINUTES = [10, 15, 30, 45, 60] as const;
const fieldClass = 'w-full rounded-xl border bg-background px-4 py-3 font-ui outline-none focus:border-secondary';
const buttonClass = 'rounded-full bg-primary px-6 py-3 font-ui font-bold text-primary-foreground disabled:opacity-50';
type SavedPreferences = NonNullable<LearningPreferences>;

export default function LearningPreferencesSettings({ profile, save, onSaved }: {
  profile: Profile;
  save: ReturnType<typeof useSaveProfile>;
  onSaved: (profile: Profile) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [age, setAge] = useState('');
  const [memorized, setMemorized] = useState('');
  const [goal, setGoal] = useState<SavedPreferences['goal'] | ''>('');
  const [minutes, setMinutes] = useState<SavedPreferences['dailyMinutes'] | ''>('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const preferences = profile.learningPreferences;
  const ageNumber = age.trim() === '' ? null : Number(age);
  const ageValid = ageNumber === null || (Number.isInteger(ageNumber) && ageNumber >= 1 && ageNumber <= 120);
  const textValid = memorized.trim().length >= 1 && memorized.length <= 1000;
  const valid = ageValid && textValid && goal !== '' && minutes !== '';

  const startEditing = () => {
    setAge(preferences?.age == null ? '' : String(preferences.age));
    setMemorized(preferences?.memorized ?? '');
    setGoal(preferences?.goal ?? '');
    setMinutes(preferences?.dailyMinutes ?? '');
    setError(''); setMessage(''); setEditing(true);
  };
  const submit = (learningPreferences: LearningPreferences) => {
    if (save.isPending) return;
    setError(''); setMessage('');
    save.mutate({ data: { name: profile.name, role: profile.role, learningPreferences } }, {
      onSuccess: (updated) => {
        onSaved(updated);
        setEditing(false); setConfirmDelete(false);
        // Do not retain cleared answers in the closed editor.
        setAge(''); setMemorized(''); setGoal(''); setMinutes('');
        setMessage(learningPreferences === null ? 'تم حذف إجابات التعلّم' : 'تم حفظ تفضيلات التعلّم');
      },
      onError: () => {
        setError(learningPreferences === null
          ? 'تعذّر حذف الإجابات. لم تُحذف؛ يمكنك تأكيد الحذف والمحاولة مرة أخرى.'
          : 'تعذّر حفظ التفضيلات. تعديلاتك ما زالت في النموذج؛ حاول مرة أخرى.');
      },
    });
  };

  return (
    <section className="paper-card p-7" aria-labelledby="learning-preferences-title" data-testid="section-learning-preferences">
      <h2 id="learning-preferences-title" className="font-display text-xl font-bold">تفضيلات التعلّم</h2>
      <p className="mt-2 font-arabic text-muted-foreground">إجاباتك خاصة بحسابك. هذه تفضيلات ذاتية، وليست درجات أو إثبات إتقان، ولا تمنح صلاحية لفتح المتون.</p>
      {editing ? (
        <form className="mt-5 space-y-4" onSubmit={(event) => {
          event.preventDefault();
          if (valid) submit({ age: ageNumber, memorized: memorized.trim(), goal, dailyMinutes: minutes });
        }}>
          <fieldset disabled={save.isPending} className="space-y-4">
            <div>
              <label htmlFor="learning-age" className="mb-2 block font-ui text-sm font-bold">العمر (اختياري)</label>
              <input id="learning-age" type="number" min={1} max={120} step={1} value={age} onChange={(event) => setAge(event.target.value)} className={fieldClass} aria-invalid={!ageValid} aria-describedby="learning-age-help" data-testid="input-learning-age" />
              <p id="learning-age-help" className="mt-1 font-ui text-xs text-muted-foreground">عدد صحيح بين ١ و١٢٠، أو اتركه فارغاً لعدم ذكر العمر.</p>
              {!ageValid && <p role="alert" className="font-ui text-sm text-destructive">أدخل عمراً صحيحاً بين ١ و١٢٠.</p>}
            </div>
            <div>
              <label htmlFor="learning-memorized" className="mb-2 block font-ui text-sm font-bold">ما حفظته من المتون أو القرآن</label>
              <textarea id="learning-memorized" value={memorized} onChange={(event) => setMemorized(event.target.value)} maxLength={1000} required rows={3} className={fieldClass} aria-describedby="learning-memorized-help" data-testid="input-learning-memorized" />
              <p id="learning-memorized-help" className="mt-1 font-ui text-xs text-muted-foreground">حتى ١٠٠٠ حرف. يمكنك كتابة «لم أحفظ شيئاً بعد».</p>
              <button type="button" onClick={() => setMemorized('لم أحفظ شيئاً بعد')} className="font-ui text-sm font-bold text-secondary">لم أحفظ شيئاً بعد</button>
            </div>
            <div>
              <label htmlFor="learning-goal" className="mb-2 block font-ui text-sm font-bold">هدفك الآن</label>
              <select id="learning-goal" value={goal} required onChange={(event) => setGoal(event.target.value as SavedPreferences['goal'])} className={fieldClass} data-testid="select-learning-goal">
                <option value="" disabled>اختر هدفك</option>
                {Object.entries(GOALS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="learning-minutes" className="mb-2 block font-ui text-sm font-bold">الوقت اليومي</label>
              <select id="learning-minutes" value={minutes} required onChange={(event) => setMinutes(Number(event.target.value) as SavedPreferences['dailyMinutes'])} className={fieldClass} data-testid="select-learning-minutes">
                <option value="" disabled>اختر الوقت</option>
                {MINUTES.map((value) => <option key={value} value={value}>{value} دقيقة</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={!valid || save.isPending} className={buttonClass} data-testid="button-save-learning">{save.isPending ? 'جارٍ الحفظ…' : error ? 'إعادة محاولة الحفظ' : 'حفظ التفضيلات'}</button>
              <button type="button" onClick={() => { setEditing(false); setError(''); setAge(''); setMemorized(''); setGoal(''); setMinutes(''); }} className="rounded-full border px-6 py-3 font-ui font-bold" data-testid="button-cancel-learning">إلغاء</button>
            </div>
          </fieldset>
        </form>
      ) : (
        <>
          {preferences ? (
            <dl className="mt-5 divide-y rounded-xl border font-arabic" data-testid="learning-preferences-summary">
              {[
                ['العمر', preferences.age == null ? 'لم يُذكر' : String(preferences.age)],
                ['المحفوظ', preferences.memorized],
                ['الهدف', GOALS[preferences.goal]],
                ['الوقت اليومي', `${preferences.dailyMinutes} دقيقة`],
              ].map(([label, value]) => <div key={label} className="px-4 py-3"><dt className="font-ui text-xs text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap break-words">{value}</dd></div>)}
            </dl>
          ) : <p className="mt-5 font-arabic text-muted-foreground" data-testid="learning-preferences-empty">لم تحفظ إجابات للتعلّم بعد. إضافتها اختيارية.</p>}
          <button type="button" onClick={startEditing} disabled={save.isPending} className={`${buttonClass} mt-4`} data-testid="button-edit-learning">{preferences ? 'تعديل التفضيلات' : 'إضافة التفضيلات'}</button>
        </>
      )}
      {preferences && <button type="button" disabled={save.isPending} onClick={() => { setError(''); setMessage(''); setConfirmDelete(true); }} className="mt-4 block rounded-full border border-destructive/60 px-6 py-3 font-ui font-bold text-destructive disabled:opacity-50" data-testid="button-delete-learning">حذف إجابات التعلّم</button>}
      {error && <p role="alert" className="mt-3 font-ui text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="mt-3 font-ui text-sm text-secondary">{message}</p>}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف إجابات التعلّم؟</AlertDialogTitle>
            <AlertDialogDescription>سيُحذف العمر والمحفوظ والهدف والوقت اليومي من حسابك. لن يتغير اسمك أو دورك أو تقدمك، ويمكنك إضافة إجابات جديدة لاحقاً.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={save.isPending} data-testid="button-cancel-delete-learning">إلغاء</AlertDialogCancel>
            <AlertDialogAction disabled={save.isPending} onClick={() => submit(null)} data-testid="button-confirm-delete-learning">نعم، احذف الإجابات</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}