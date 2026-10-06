import { tr } from '@/lib/i18n';
import { type ReactNode, useState } from 'react';
import { Link } from 'wouter';
import { Download, ShieldAlert } from 'lucide-react';
import { downloadQualificationDocument, type ReviewAudit } from '@workspace/api-client-react';
import { Notice } from '@/components/mateen/bits';
import { errMsg } from '@/lib/admin';
import { fmtDate } from '@/lib/mateen';
import { cn } from '@/lib/utils';

export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'ok' | 'warn' | 'bad' }) {
  const t = { muted: 'bg-muted text-foreground/75', ok: 'bg-emerald-100 text-emerald-900', warn: 'bg-amber-100 text-amber-900', bad: 'bg-red-100 text-red-900' }[tone];
  return <span className={cn('inline-flex rounded-full px-3 py-0.5 font-ui text-xs font-bold', t)}>{children}</span>;
}
export const toneOf = (s: string): 'muted' | 'ok' | 'warn' | 'bad' =>
  ['approved', 'clean', 'cleared'].includes(s) ? 'ok' : ['rejected', 'withdrawn'].includes(s) ? 'bad' : ['pending_review', 'pending', 'needs_information', 'uploading'].includes(s) ? 'warn' : 'muted';

export function SecurityNotice({ settingsHref = '/teacher/settings', reason }: { settingsHref?: string; reason?: string }) {
  return (
    <div className="space-y-3" data-testid="notice-security">
      <Notice tone="amber" title={tr("تحقق من صلاحية الحساب وتوثيق البريد")}>
        {reason ? <span className="block">{reason}</span> : null}{tr("يلزم حساب نشط وبريد إلكتروني موثّق وصلاحية مراجعة يمنحها مسؤول النظام. المصادقة الثنائية اختيارية وليست شرطًا للمراجعة.")}</Notice>
      <Link href={settingsHref} className="inline-flex items-center gap-2 rounded-full border px-5 py-2 font-ui text-sm font-bold hover:bg-muted" data-testid="link-account-security">
        <ShieldAlert size={16} />{' '}{tr("إعدادات أمان الحساب")}</Link>
    </div>
  );
}

export function DocDownload({ id, name }: { id: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    try {
      const blob = await downloadQualificationDocument(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { setErr(errMsg(e, tr("تعذّر تنزيل الوثيقة."))); } finally { setBusy(false); }
  };
  return (
    <span className="inline-flex flex-col items-start">
      <button type="button" onClick={go} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-ui text-xs font-bold hover:bg-muted disabled:opacity-50" data-testid={`button-download-${id}`}>
        <Download size={13} /> {busy ? tr("جارٍ التنزيل…") : tr("تنزيل")}
      </button>
      {err ? <span className="mt-1 font-ui text-xs text-red-800" role="alert">{err}</span> : null}
    </span>
  );
}

export function History({ items, empty = tr("لا سجل بعد.") }: { items: ReviewAudit[]; empty?: string }) {
  if (!items.length) return <p className="font-ui text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol className="space-y-2 border-s-2 ps-4" data-testid="list-history">
      {[...items].reverse().map((h) => (
        <li key={h.id} className="font-ui text-sm">
          <span className="font-bold">{h.action}</span> <span className="text-xs text-muted-foreground">· {fmtDate(h.createdAt)}</span>
          {h.reason ? <p className="font-arabic text-base leading-loose text-foreground/80">{h.reason}</p> : null}
        </li>
      ))}
    </ol>
  );
}
