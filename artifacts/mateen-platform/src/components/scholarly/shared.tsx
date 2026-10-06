import { tr } from '@/lib/i18n';
import { type ReactNode, useEffect, useState } from 'react';
import type { Citation, CitationSourceStatus } from '@workspace/api-client-react';
import { BookOpenText } from 'lucide-react';
import { num, fmtDate } from '@/lib/mateen';

export const field = 'w-full rounded-xl border bg-card px-4 py-3 font-ui text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary';
export const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-2.5 font-ui text-sm font-semibold text-primary-foreground disabled:opacity-50';
export const btnGhost = 'inline-flex items-center justify-center gap-2 rounded-full border px-5 py-2 font-ui text-sm font-semibold hover:bg-muted disabled:opacity-50';

const LABELS: Record<string, string> = {
  get answered() { return tr("أُجيب"); }, get unverified() { return tr("لم يُعتمد علمياً"); }, get abstained() { return tr("يحتاج متابعة"); }, get waiting_for_teacher() { return tr("بانتظار معلم"); }, get referred() { return tr("أُحيل إلى معلم"); },
  get not_referred() { return tr("دون إحالة"); }, get awaiting_reply() { return tr("بانتظار الرد"); }, get draft() { return tr("مسودة"); }, get reviewed() { return tr("مراجَع"); }, get indexed() { return tr("مفهرس"); }, get withdrawn() { return tr("مسحوب"); },
  get open() { return tr("مفتوح"); }, get closed() { return tr("مغلق"); }, get resolved() { return tr("محلول"); },
};
export const label = (s: string) => LABELS[s] ?? s;

export function StatusPill({ status }: { status: string }) {
  return <span className="inline-block rounded-full border border-secondary/30 bg-card px-3 py-1 font-ui text-xs font-bold text-secondary" data-testid={`status-${status}`}>{label(status)}</span>;
}

export function Field({ label: l, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="font-ui text-sm font-semibold">{l}</span>{children}{hint && <span className="block font-ui text-xs text-muted-foreground">{hint}</span>}</label>;
}

export type StatusView = { phase: 'pending' | 'error' | 'ready'; items: CitationSourceStatus[]; retry?: () => void };

const STATE_LABEL: Record<string, string> = { get eligible() { return tr("مؤهل للاسترجاع حالياً"); }, get withdrawn() { return tr("سُحب المصدر"); }, get ineligible() { return tr("غير مؤهل للاسترجاع حالياً"); }, get unavailable() { return tr("تعذّر التحقق من الحالة الحالية"); } };

/** Fail-closed: only exact allowlisted public reference shapes. */
export function safeSourceUrl(raw?: string | null): string | null {
  if (!raw) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password || u.port || u.hash) return null;
  const pos = (v: string) => /^[1-9]\d*$/.test(v);
  if (u.hostname === 'aljam3.com') {
    const m = /^\/ar\/3190\/7673\/(\d+)$/.exec(u.pathname);
    return m && pos(m[1]) && !u.search ? u.href : null;
  }
  if (u.hostname === 'turath.io') {
    if (!/^\/book\/[1-9]\d*$/.test(u.pathname)) return null;
    if (u.search) {
      const p = [...u.searchParams.keys()];
      if (p.length !== 1 || p[0] !== 'page' || !pos(u.searchParams.get('page') ?? '')) return null;
      if (u.search !== `?page=${u.searchParams.get('page')}`) return null;
    }
    return u.href;
  }
  return null;
}

function Meta({ k, v }: { k: string; v: ReactNode }) {
  return <span className="min-w-0 break-words">{k}: {v}</span>;
}

export function CitationList({ citations, status }: { citations: Citation[]; status?: StatusView }) {
  if (!citations.length) return null;
  return (
    <ol className="mt-4 space-y-3" data-testid="list-citations">
      {citations.map((c, i) => {
        const cur = status?.phase === 'ready' ? status.items.find((s) => s.sourceId === c.sourceId) : undefined;
        const href = cur && cur.state === 'eligible' && cur.versionChanged === false ? safeSourceUrl(c.publicSourceUrl) : null;
        return (
        <li key={`${c.passageId}-${i}`} className="min-w-0 rounded-2xl border border-secondary/25 bg-background p-3 sm:p-4">
          <p className="flex items-start gap-2 break-words font-ui text-sm font-bold"><BookOpenText size={16} className="mt-1 shrink-0 text-secondary" /><span className="min-w-0">{c.sourceTitle} — {c.author}</span></p>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-ui text-xs text-muted-foreground">
            {c.edition && <Meta k={tr("الطبعة")} v={c.edition} />}
            {c.sourceVersion && <Meta k={tr("إصدار المصدر")} v={c.sourceVersion} />}
            {c.volume != null && <Meta k={tr("المجلد")} v={num(c.volume)} />}
            {c.printedPage && <Meta k={tr("الصفحة المطبوعة")} v={c.printedPage} />}
            {c.pdfPage != null && <Meta k={tr("صفحة PDF")} v={num(c.pdfPage)} />}
            {c.viewerPage != null && <Meta k={tr("صفحة العارض")} v={num(c.viewerPage)} />}
          </p>
          <p className="mt-3 font-ui text-xs font-bold text-secondary">{tr("اقتباس متحقق من مطابقته للمصدر")}</p>
          <blockquote dir="rtl" className="mt-1 break-words border-s-2 border-secondary ps-3 font-arabic text-base leading-loose">{c.quote}</blockquote>
          <div className="mt-3 space-y-1 rounded-xl bg-muted/50 p-2.5 font-ui text-xs leading-relaxed">
            <p data-testid={`snapshot-status-${i}`}><b>{tr("وقت الإجابة:")}</b>{' '}
              {c.sourceStatusAtAnswer === 'indexed' ? <>{tr("مفهرس ومؤهل للاسترجاع في هذه المكتبة")}{c.snapshotAt && <> · {fmtDate(c.snapshotAt)}</>}</> : tr("لا تتوفر بيانات حالة وقت الإجابة")}
            </p>
            {status && <p data-testid={`current-status-${i}`}><b>{tr("الآن:")}</b>{' '}
              {status.phase === 'pending' ? tr("جارٍ التحقق…")
                : status.phase === 'error' ? <>{tr("تعذر التحقق من الحالة الحالية.")}{' '}<button type="button" onClick={status.retry} className="min-h-8 font-semibold text-secondary underline">{tr("إعادة المحاولة")}</button></>
                : !cur ? tr("تعذّر التحقق من الحالة الحالية")
                : <>{STATE_LABEL[cur.state] ?? cur.state}{' '}{tr("· فُحص")}{' '}{fmtDate(cur.checkedAt)}{cur.versionChanged === true && tr(" · تغيّرت نسخة المصدر بعد الإجابة")}{cur.versionChanged == null && cur.state === 'eligible' && tr(" · تعذر مقارنة النسخة")}</>}
            </p>}
            {href && <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center font-semibold text-secondary underline" data-testid={`link-source-${i}`}>{tr("فتح المرجع المنشور")}</a>}
          </div>
        </li>
        );
      })}
    </ol>
  );
}

export const noFatwa = () => tr('هذا المساعد يولّد شروحاً تعليمية آلية قد تخطئ؛ لا يصدر فتوى ولا يغني عن العالم المؤهل.');

/** Finite polling: returns interval ms until maxMs elapsed since mount/reset, then false. */
export function useFinitePoll(ms = 8000, maxMs = 300000, resetKey: unknown = null) {
  const [live, setLive] = useState(true);
  useEffect(() => { setLive(true); const t = setTimeout(() => setLive(false), maxMs); return () => clearTimeout(t); }, [maxMs, resetKey]);
  return live ? ms : false;
}
