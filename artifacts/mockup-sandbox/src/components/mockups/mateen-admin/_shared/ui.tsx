import { X } from "lucide-react";
import type { ReactNode } from "react";
import { initials } from "./data";

export function Initials({ name, size = 36, tone = "primary" }: { name: string; size?: number; tone?: "primary" | "secondary" | "tertiary" | "muted" }) {
  return (
    <span className={`ma-initials ma-initials-${tone}`} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials(name)}
    </span>
  );
}

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "ok" | "warn" | "danger" | "info" | "primary" }) {
  return <span className={`ma-badge ma-badge-${tone}`}>{children}</span>;
}

export function Btn({
  children,
  onClick,
  variant = "outline",
  size = "md",
  disabled,
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md";
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
}) {
  return (
    <button type={type} title={title} disabled={disabled} onClick={onClick} className={`ma-btn ma-btn-${variant} ma-btn-${size}`}>
      {children}
    </button>
  );
}

export function Card({ children, className = "", title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={`ma-card ${className}`}>
      {(title || action) && (
        <header className="ma-card-head">
          <h3 className="ma-card-title">{title}</h3>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHead({ title, sub, action }: { title: string; sub: string; action?: ReactNode }) {
  return (
    <div className="ma-pagehead">
      <div>
        <h1 className="ma-h1">{title}</h1>
        <p className="ma-sub">{sub}</p>
      </div>
      {action && <div className="ma-pagehead-action">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="ma-overlay" onClick={onClose} role="presentation">
      <div className={`ma-modal ${wide ? "ma-modal-wide" : ""}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <header className="ma-modal-head">
          <h3 className="ma-modal-title">{title}</h3>
          <button className="ma-iconbtn" onClick={onClose} aria-label="إغلاق">
            <X size={16} />
          </button>
        </header>
        <div className="ma-modal-body">{children}</div>
        {footer && <footer className="ma-modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="ma-field">
      <span className="ma-label">{label}</span>
      {children}
      {hint && <span className="ma-hint">{hint}</span>}
    </label>
  );
}

export function Empty({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="ma-empty">
      <div className="ma-empty-mark" />
      <p className="ma-empty-title">{title}</p>
      <p className="ma-empty-sub">{sub}</p>
    </div>
  );
}

export function Stat({ label, value, delta, tone = "primary" }: { label: string; value: string; delta?: string; tone?: "primary" | "secondary" | "tertiary" }) {
  return (
    <div className={`ma-stat ma-stat-${tone}`}>
      <span className="ma-stat-label">{label}</span>
      <span className="ma-stat-value">{value}</span>
      {delta && <span className="ma-stat-delta">{delta}</span>}
    </div>
  );
}

export function DemoTag() {
  return <span className="ma-demo">نموذج تفاعلي — بيانات توضيحية</span>;
}
