/**
 * One Transparency slider (0–80%) for the cards AND, in the Windows desktop app, the window itself.
 * The window goes half as far as the cards (80% → window 60%), so text stays readable over the desktop.
 * `onDark` = placed on the always-dark sidebar.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Droplet } from "lucide-react";
import { useEffect, useRef } from "react";
import { api } from "../lib/api.ts";
import { cn } from "../lib/format.ts";
import { MAX_TRANSPARENCY, useTransparency } from "../lib/glass.ts";

/** Card transparency → window opacity (%). null ("auto") = solid window. */
export const windowOpacityFor = (t: number | null) => (t === null ? 100 : Math.max(50, 100 - Math.round(t / 2)));

export function TransparencySlider({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  const [t, setT] = useTransparency();
  const win = useQuery({ queryKey: ["window"], queryFn: api.windowState, staleTime: Infinity, retry: false });
  const setWindow = useMutation({ mutationFn: (opacity: number) => api.setWindow(opacity) });
  const linked = !!win.data?.available;

  // Debounced: the window is set ~0.3 s after the slider stops (each call runs a tiny PowerShell script).
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const first = useRef(true);
  useEffect(() => {
    if (!linked) return;
    if (first.current) {
      first.current = false;
      return; // the launcher already applied the saved value
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setWindow.mutate(windowOpacityFor(t)), 300);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, linked]);

  const value = t ?? 20;
  return (
    <div className={cn("px-1 text-xs", onDark ? "text-slate-400" : "text-slate-500", className)}>
      <div className="flex items-center gap-2">
        <Droplet size={14} className="shrink-0" aria-hidden />
        <label htmlFor="sb-transparency" className="shrink-0">
          Transparency
        </label>
        <input
          id="sb-transparency"
          type="range"
          min={0}
          max={MAX_TRANSPARENCY}
          step={5}
          value={value}
          onChange={(e) => setT(Number(e.target.value))}
          className="min-w-0 flex-1 accent-sky-500"
        />
        <button
          onClick={() => setT(null)}
          title="Reset to the theme default (solid window)"
          className={cn("w-9 shrink-0 text-right tabular-nums", t === null ? "opacity-60" : onDark ? "hover:text-white" : "hover:text-slate-900 dark:hover:text-white")}
        >
          {t === null ? "auto" : `${t}%`}
        </button>
      </div>
      {linked && (
        <p className={cn("mt-1 pl-[22px] text-[11px]", onDark ? "text-slate-500" : "text-slate-400")} title="The desktop window follows the slider at half strength">
          {setWindow.isError ? "Window: couldn't apply" : `Window ${windowOpacityFor(t)}% visible`}
        </p>
      )}
    </div>
  );
}
