import { tr } from '@/lib/i18n';
import { useState } from 'react';
import { UserProfile, useSession, useUser } from '@clerk/react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/** Email recovery only. Optional account security remains managed by Clerk. */
export function ReviewSecurity({ refresh }: { refresh: () => Promise<unknown> }) {
  const { user } = useUser();
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const recheck = async () => {
    setBusy(true); setMessage('');
    try {
      await user?.reload();
      await session?.reload();
      await session?.getToken({ skipCache: true });
      await refresh();
      setMessage(tr("تم تحديث حالة توثيق البريد."));
    } catch {
      setMessage(tr("تعذّر تحديث حالة البريد. حاول مجددًا."));
    } finally { setBusy(false); }
  };
  const close = () => { setOpen(false); void recheck(); };
  const button = 'min-h-11 w-full rounded-full border px-5 py-2 font-ui text-sm font-bold hover:bg-muted disabled:opacity-50 sm:w-auto';
  return (
    <section className="paper-card min-w-0 space-y-4 p-5 sm:p-6" aria-label={tr("توثيق بريد المراجع")}>
      <h2 className="font-display text-xl font-bold">{tr("توثيق البريد الإلكتروني")}</h2>
      <p className="font-arabic leading-loose">{tr("وثّق بريدك الأساسي من ملف الحساب، ثم حدّث حالة الوصول. يكفي تسجيل الدخول العادي مع الصلاحية الممنوحة وحساب نشط؛ المصادقة الثنائية اختيارية وليست شرطًا للمراجعة.")}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={button} disabled={busy} onClick={() => { setMessage(''); setOpen(true); }} data-testid="button-review-email">{tr("توثيق البريد الإلكتروني")}</button>
        <button type="button" className={button} disabled={busy} onClick={() => void recheck()} data-testid="button-recheck-access">{busy ? tr("جارٍ التحقق…") : tr("تحديث حالة الوصول")}</button>
      </div>
      {message || busy ? <p className="font-ui text-sm leading-7" role="status" aria-live="polite">{busy ? tr("جارٍ تحديث حالة البريد والتحقق من الخادم…") : message}</p> : null}
      <Dialog modal={false} open={open} onOpenChange={(value) => value ? setOpen(true) : close()}>
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-1rem)] max-w-5xl overflow-y-auto p-3 sm:p-6">
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 bg-background pb-3">
            <DialogTitle className="px-7">{tr("توثيق بريد الحساب")}</DialogTitle>
            <button type="button" onClick={close} className={button} data-testid="button-review-security-done">{tr("إنهاء وتحديث الوصول")}</button>
          </div>
          <UserProfile routing="hash" __experimental_startPath="/" appearance={{ elements: {
            rootBox: '!w-full !max-w-full !min-w-0',
            cardBox: '!w-full sm:!w-full !max-w-full !min-w-0 !shadow-none',
            card: '!flex !flex-col sm:!flex-row !w-full !min-w-0 !shadow-none',
            navbar: '!relative !inset-auto !flex !h-auto !min-h-0 !w-full !max-w-full !transform-none !p-3 sm:!w-52',
            navbarButtons: '!flex !flex-row !flex-wrap !gap-2 sm:!flex-col',
            navbarMobileMenuRow: '!hidden',
            pageScrollBox: '!w-full !min-w-0 !max-w-full',
          } }} />
        </DialogContent>
      </Dialog>
    </section>
  );
}
