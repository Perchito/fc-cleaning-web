import { useEffect } from "react";
import { useToasts } from "./api.js";

const cx = (...a) => a.filter(Boolean).join(" ");

export function Button({ variant = "primary", size = "md", className, ...props }) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed";
  const sizes = { sm: "px-2.5 py-1 text-xs", md: "px-3.5 py-2 text-sm" };
  const variants = {
    primary: "bg-navy-900 text-white hover:bg-navy-800",
    teal: "bg-teal-600 text-white hover:bg-teal-700",
    ghost: "bg-transparent text-navy-700 hover:bg-navy-100",
    subtle: "bg-navy-100 text-navy-800 hover:bg-navy-200",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
    outline: "border border-navy-200 bg-white text-navy-800 hover:bg-navy-50",
  };
  return <button className={cx(base, sizes[size], variants[variant], className)} {...props} />;
}

const BADGE = {
  gray: "bg-navy-100 text-navy-700",
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  blue: "bg-sky-100 text-sky-800",
  rose: "bg-rose-100 text-rose-800",
  teal: "bg-teal-100 text-teal-800",
  purple: "bg-violet-100 text-violet-800",
};
export function Badge({ tone = "gray", children, className }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        BADGE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({ className, ...props }) {
  return (
    <div
      className={cx("rounded-xl border border-navy-200/70 bg-white shadow-sm", className)}
      {...props}
    />
  );
}

export function Spinner({ className }) {
  return (
    <svg className={cx("animate-spin", className || "h-5 w-5 text-navy-400")} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function Loading({ label = "Loading…" }) {
  return (
    <div className="flex items-center gap-2 py-16 justify-center text-navy-500 text-sm">
      <Spinner /> {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      <div className="font-semibold">Something went wrong</div>
      <div className="mt-1 break-anywhere">{String(error)}</div>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Empty({ icon = "·", title, children }) {
  return (
    <div className="py-16 text-center">
      <div className="text-3xl">{icon}</div>
      <div className="mt-2 font-semibold text-navy-800">{title}</div>
      {children && <div className="mt-1 text-sm text-navy-500">{children}</div>}
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-xs font-semibold text-navy-600">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-[11px] text-navy-400">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-400 focus:ring-2 focus:ring-navy-200";
export const Input = (p) => <input {...p} className={cx(inputCls, p.className)} />;
export const TextArea = (p) => (
  <textarea {...p} className={cx(inputCls, "min-h-[7rem] font-mono text-[13px] leading-relaxed", p.className)} />
);
export const Select = (p) => <select {...p} className={cx(inputCls, "pr-8", p.className)} />;

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/40 p-4 sm:p-8">
      <div
        className={cx(
          "w-full rounded-2xl bg-white shadow-2xl",
          wide ? "max-w-4xl" : "max-w-lg",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-navy-100 px-5 py-3.5">
          <h2 className="text-sm font-bold text-navy-900">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-navy-400 hover:bg-navy-100 hover:text-navy-700">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-navy-950/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-navy-100 bg-white/95 px-5 py-3.5 backdrop-blur">
          <h2 className="text-sm font-bold text-navy-900">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-navy-400 hover:bg-navy-100 hover:text-navy-700">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function StatTile({ label, value, sub, tone = "navy" }) {
  const tones = { navy: "text-navy-900", teal: "text-teal-600", rose: "text-rose-600", emerald: "text-emerald-600" };
  return (
    <Card className="p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-navy-400">{label}</div>
      <div className={cx("mt-1 text-2xl font-extrabold tabular-nums", tones[tone])}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-navy-500">{sub}</div>}
    </Card>
  );
}

export function Toaster() {
  const items = useToasts();
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={cx(
            "rounded-lg px-4 py-2 text-sm font-medium shadow-lg",
            t.kind === "error"
              ? "bg-rose-600 text-white"
              : t.kind === "success"
                ? "bg-emerald-600 text-white"
                : "bg-navy-900 text-white",
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
