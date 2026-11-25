import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "../lib/format.ts";
import { useTheme, type ThemePref } from "../lib/theme.ts";

const OPTIONS: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

/** Light / Dark / System. `onDark` = placed on the always-dark sidebar. */
export function ThemeToggle({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  const [pref, setPref] = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "flex gap-0.5 rounded-lg border p-0.5",
        onDark ? "border-sky-400/25 bg-white/5" : "border-[var(--line)] bg-[var(--lane)]",
        className,
      )}
    >
      {OPTIONS.map(({ id, label, icon: Icon }) => {
        const on = pref === id;
        return (
          <button
            key={id}
            role="radio"
            aria-checked={on}
            title={label}
            onClick={() => setPref(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition",
              on
                ? "bg-accent-600 text-white shadow-[0_0_12px_rgb(var(--glow-rgb)/0.4)]"
                : onDark
                  ? "text-slate-400 hover:text-white"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
            )}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
