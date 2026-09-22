import { createContext, useContext, type ReactNode } from "react";
import {
  BookOpenText,
  ChartNoAxesColumn,
  Home,
  Library,
  MessagesSquare,
  Moon,
  ScrollText,
  Sun,
  Menu,
  X,
  Bell,
  Info,
} from "lucide-react";
import { MOCK_LABEL, toArabicDigits, type ProgressMap, type Route, type Thread } from "./data";

/* ---------- Context ---------- */

export interface PortalState {
  route: Route;
  navigate: (r: Route) => void;
  progress: ProgressMap;
  setProgress: (fn: (p: ProgressMap) => ProgressMap) => void;
  threads: Thread[];
  setThreads: (fn: (t: Thread[]) => Thread[]) => void;
  threshold: number;
  setThreshold: (n: number) => void;
  toast: (msg: string) => void;
  dark: boolean;
  setDark: (d: boolean) => void;
}

export const PortalContext = createContext<PortalState | null>(null);

export function usePortal(): PortalState {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("PortalContext missing");
  return ctx;
}

/* ---------- Atoms ---------- */

export function Initials({
  text,
  size = 40,
  tone = "primary",
}: {
  text: string;
  size?: number;
  tone?: "primary" | "secondary" | "tertiary" | "gold";
}) {
  return (
    <span
      className={`ms-initials tone-${tone}`}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      aria-hidden
    >
      {text}
    </span>
  );
}

export function Bar({ value, tone }: { value: number; tone?: "primary" | "tertiary" | "ok" }) {
  return (
    <div className={`ms-bar ${tone ? `tone-${tone}` : ""}`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function MockTag({ className = "" }: { className?: string }) {
  return (
    <span className={`ms-mock-banner ${className}`}>
      <Info size={13} />
      {MOCK_LABEL}
    </span>
  );
}

export function SectionHead({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div>
        {eyebrow && (
          <p className="ms-ui text-[0.72rem] font-bold tracking-wide text-[var(--ms-secondary)] mb-1">
            {eyebrow}
          </p>
        )}
        <h2 className="ms-display text-xl md:text-2xl font-bold text-[var(--ms-ink)] leading-tight">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Ring({ value, size = 88, stroke = 8, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--ms-line)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--ms-secondary)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 800ms cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="ms-display font-bold ms-tabular" style={{ fontSize: size * 0.24 }}>
            {toArabicDigits(Math.round(value))}٪
          </div>
          {label && <div className="ms-ui text-[0.6rem] text-[var(--ms-ink-faint)] -mt-0.5">{label}</div>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Shell ---------- */

const NAV: { key: Route["page"]; label: string; icon: typeof Home; match: Route["page"][] }[] = [
  { key: "home", label: "الرئيسية", icon: Home, match: ["home"] },
  { key: "tracks", label: "المسارات", icon: Library, match: ["tracks", "track", "book", "exam"] },
  { key: "performance", label: "الأداء", icon: ChartNoAxesColumn, match: ["performance"] },
  { key: "scholars", label: "المشايخ", icon: ScrollText, match: ["scholars", "scholar"] },
  { key: "messages", label: "الرسائل", icon: MessagesSquare, match: ["messages"] },
];

export function Shell({
  children,
  menuOpen,
  setMenuOpen,
}: {
  children: ReactNode;
  menuOpen: boolean;
  setMenuOpen: (b: boolean) => void;
}) {
  const { route, navigate, threads, dark, setDark } = usePortal();
  const unread = threads.reduce((a, t) => a + t.unread, 0);
  const isActive = (m: Route["page"][]) => m.includes(route.page);

  const sidebar = (
    <div className="ms-side relative h-full flex flex-col px-4 py-5 w-[264px]">
      <div className="relative flex items-center gap-3 px-2 mb-8">
        <img
          src="/__mockup/images/mateen-student-logo.png"
          alt="مَتين"
          className="h-10 w-auto"
          style={{ filter: "brightness(0) invert(1) opacity(0.92)" }}
        />
        <div className="leading-tight">
          <div className="ms-display font-bold text-[1.05rem]">مَتِين</div>
          <div className="ms-ui text-[0.68rem] text-[var(--ms-walnut-ink-soft)]">بوابة الطالب</div>
        </div>
        <button
          className="ms-btn ms-btn-ghost ms-btn-icon lg:hidden ms-auto text-[var(--ms-walnut-ink)] mr-auto"
          onClick={() => setMenuOpen(false)}
          aria-label="إغلاق القائمة"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="relative flex flex-col gap-1">
        {NAV.map((n) => (
          <button
            key={n.key}
            className={`ms-nav-item ${isActive(n.match) ? "is-active" : ""}`}
            onClick={() => {
              navigate({ page: n.key });
              setMenuOpen(false);
            }}
          >
            <n.icon size={18} strokeWidth={1.9} />
            <span>{n.label}</span>
            {n.key === "messages" && unread > 0 && <span className="ms-nav-badge">{toArabicDigits(unread)}</span>}
          </button>
        ))}
      </nav>

      <div className="relative mt-auto space-y-3">
        <div className="rounded-2xl p-3.5" style={{ background: "rgba(253,249,243,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-2 mb-2">
            <BookOpenText size={16} className="text-[var(--ms-gold)]" />
            <span className="ms-ui text-[0.78rem] font-bold">ورد اليوم</span>
          </div>
          <p className="ms-body text-[0.85rem] leading-relaxed text-[var(--ms-walnut-ink-soft)]">
            مراجعة النواقض السبعة الأولى، ثم حفظ الناقض الثامن.
          </p>
          <button
            className="ms-btn ms-btn-sm mt-3 w-full"
            style={{ background: "var(--ms-gold)", color: "#2c1e17" }}
            onClick={() => {
              navigate({ page: "book", trackId: "aqeedah", levelId: "aqeedah-0" });
              setMenuOpen(false);
            }}
          >
            ابدأ الورد
          </button>
        </div>
        <div className="flex items-center justify-between px-2">
          <span className="ms-ui text-[0.75rem] text-[var(--ms-walnut-ink-soft)] flex items-center gap-1.5">
            {dark ? <Moon size={14} /> : <Sun size={14} />}
            {dark ? "الوضع الداكن" : "الوضع الفاتح"}
          </span>
          <button className="ms-switch" role="switch" aria-checked={dark} onClick={() => setDark(!dark)} aria-label="تبديل الوضع" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="ms-manuscript min-h-[100dvh] flex">
      {/* Desktop sidebar (right side in RTL: first child in DOM appears at right) */}
      <aside className="hidden lg:block sticky top-0 h-[100dvh] shrink-0">{sidebar}</aside>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="ms-overlay absolute inset-0 ms-fade" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 right-0 ms-rise">{sidebar}</div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-40 backdrop-blur-md" style={{ background: "color-mix(in srgb, var(--ms-bg) 82%, transparent)", borderBottom: "1px solid var(--ms-line)" }}>
          <div className="flex items-center gap-3 px-4 md:px-8 h-16">
            <button className="ms-btn ms-btn-outline ms-btn-icon lg:hidden" onClick={() => setMenuOpen(true)} aria-label="القائمة">
              <Menu size={18} />
            </button>
            <div className="hidden sm:block">
              <MockTag />
            </div>
            <div className="mr-auto flex items-center gap-2">
              <button className="ms-btn ms-btn-ghost ms-btn-icon hidden md:inline-flex" onClick={() => setDark(!dark)} aria-label="تبديل الوضع">
                {dark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                className="ms-btn ms-btn-ghost ms-btn-icon relative"
                onClick={() => navigate({ page: "messages" })}
                aria-label="التنبيهات"
              >
                <Bell size={18} />
                {unread > 0 && <span className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-[var(--ms-secondary)]" />}
              </button>
              <button className="flex items-center gap-2 pr-2" onClick={() => navigate({ page: "performance" })}>
                <span className="hidden md:block text-right leading-tight">
                  <span className="ms-ui block text-[0.8rem] font-bold">عبدالرحمن الحربي</span>
                  <span className="ms-ui block text-[0.65rem] text-[var(--ms-ink-faint)]">طالب — ثلاثة مسارات</span>
                </span>
                <Initials text="ع" size={36} />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 md:px-8 py-6 md:py-8 pb-24 lg:pb-10 max-w-[1240px] w-full mx-auto">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="ms-mobile-bar fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 px-2 pb-[env(safe-area-inset-bottom)] lg:hidden">
          {NAV.map((n) => (
            <button key={n.key} className={isActive(n.match) ? "is-active" : ""} onClick={() => navigate({ page: n.key })}>
              <n.icon size={20} strokeWidth={1.9} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
