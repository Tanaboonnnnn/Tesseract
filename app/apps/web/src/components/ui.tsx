import { CircleAlert, X } from "lucide-react";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/format.ts";
import { useLocation } from "react-router";
import { useLayout } from "../lib/theme.ts";
import { fieldbookPage } from "../lib/fieldbook-workspace.ts";

/** A "system window": glowing frame with corner brackets. */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("panel p-5", className)}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <h2 className="sb-section-title hud-title flex items-center gap-2 text-[15px]">
        <span className="sb-title-mark h-3.5 w-1 rounded-full bg-accent-600 shadow-[0_0_8px_rgb(var(--glow-rgb)/0.7)] dark:bg-sky-400" />
        {children}
      </h2>
      {action}
    </div>
  );
}

const BAR_COLORS = {
  accent: "bg-gradient-to-r from-accent-600 to-sky-400",
  green: "bg-gradient-to-r from-emerald-500 to-teal-300",
  blue: "bg-gradient-to-r from-sky-500 to-cyan-300",
  amber: "bg-gradient-to-r from-amber-500 to-yellow-300",
} as const;

export function ProgressBar({ value, color = "accent", className }: { value: number; color?: keyof typeof BAR_COLORS; className?: string }) {
  return (
    <div className={cn("sb-bar h-1.5 w-full overflow-hidden rounded-full bg-[var(--lane)] ring-1 ring-[var(--line)] ring-inset", className)}>
      <div
        className={cn("sb-bar-fill h-full rounded-full transition-[width] duration-500 dark:bar-glow", BAR_COLORS[color])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/** Circular progress (Bento layout). */
export function ProgressRing({ value, size = 44, className }: { value: number; size?: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn("shrink-0 -rotate-90", className)} role="img" aria-label={`${v}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-accent-500)" strokeWidth={5} strokeLinecap="round" strokeDasharray={`${(c * v) / 100} ${c}`} />
    </svg>
  );
}

const CHIP_TONES = {
  neutral: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
  accent: "bg-accent-50 text-accent-700 ring-1 ring-accent-200/60 ring-inset dark:bg-sky-400/10 dark:text-sky-200 dark:ring-sky-400/30",
  red: "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  blue: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
} as const;
export type Tone = keyof typeof CHIP_TONES;

export function Chip({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("sb-chip inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium", CHIP_TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  return (
    <button
      {...props}
      className={cn(
        "sb-btn inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-50",
        `sb-btn-${variant}`,
        variant === "primary" &&
          "bg-accent-600 text-white shadow-[0_0_14px_rgb(var(--glow-rgb)/0.35)] hover:bg-accent-700 hover:shadow-[0_0_20px_rgb(var(--glow-rgb)/0.55)]",
        variant === "ghost" && "text-slate-600 hover:bg-[var(--lane)] dark:text-slate-300",
        variant === "danger" && "text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10",
        className,
      )}
    />
  );
}

export const inputClass =
  "w-full rounded-md border border-[var(--line)] bg-[var(--panel-solid)] px-3 py-2 text-sm outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-100 dark:focus:border-sky-400 dark:focus:ring-sky-400/20";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      {children}
    </label>
  );
}

export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // showModal() focuses the Close button; start in the first field instead.
      d.querySelector<HTMLElement>("input, textarea, select")?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="panel-solid m-auto w-[min(440px,calc(100vw-2rem))] rounded-xl p-0 text-slate-800 backdrop:bg-slate-950/50 backdrop:backdrop-blur-[3px] dark:text-slate-200"
    >
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 id={titleId} className="hud-title text-base">{title}</h3>
            <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-[var(--lane)]" aria-label="Close">
              <X size={16} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="flex items-start gap-1.5 rounded-md bg-rose-50 px-3 py-2 text-xs whitespace-pre-line text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
      <CircleAlert size={14} className="mt-px shrink-0" />
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
}

export function Loading() {
  return (
    <div className="grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="lane h-32" />
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  const [layout]=useLayout();
  const { pathname }=useLocation();
  return (
    <header className="sb-page-header mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {layout==="fieldbook"&&<p className="fk-label">Fieldbook / {fieldbookPage(pathname).section}</p>}
        <h1 className="sb-page-title hud-title text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

/** Segmented filter (uses aria-pressed for the active state). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.id} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
