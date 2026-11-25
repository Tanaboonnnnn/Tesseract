/**
 * Remote access switch (Phase 8a): lets ChatGPT (web/phone) reach a read-mostly Panya through OpenAI's
 * outbound-only tunnel. Off by default, on for 1 / 8 / 24 hours, then off by itself. Only this PC can switch it.
 * `onDark` = placed on the always-dark sidebar.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Globe, X } from "lucide-react";
import { api, type RemoteInfo } from "../lib/api.ts";
import { cn } from "../lib/format.ts";

const HOURS = [1, 8, 24] as const;

export function RemoteAccess({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  const qc = useQueryClient();
  const remote = useQuery({ queryKey: ["remote"], queryFn: api.remote, refetchInterval: (q) => (q.state.data?.available && q.state.data.on ? 60_000 : false) });
  const session = useQuery({ queryKey: ["session"], queryFn: api.session, staleTime: Infinity });
  const set = (r: RemoteInfo) => qc.setQueryData(["remote"], r);
  const start = useMutation({ mutationFn: (hours: number) => api.remoteStart(hours), onSuccess: set });
  const stop = useMutation({ mutationFn: api.remoteStop, onSuccess: set });

  const r = remote.data;
  if (!r?.available) return null;
  const local = !!session.data?.local;
  const ready = r.setup.binary && r.setup.key && r.setup.tunnel;
  const until = r.until ? new Date(r.until).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;
  const muted = onDark ? "text-slate-400" : "text-slate-500";
  const btn = cn(
    "rounded px-1.5 py-0.5 text-[11px] ring-1",
    onDark ? "text-slate-300 ring-sky-400/25 hover:text-white" : "text-slate-600 ring-[var(--line)] hover:text-accent-600 dark:text-slate-300",
  );

  return (
    <div className={cn("px-1 text-xs", muted, className)}>
      <div className="flex items-center gap-2">
        <Globe size={14} className={cn("shrink-0", r.on && "text-emerald-400")} aria-hidden />
        <span className="flex-1">
          Remote access{" "}
          {r.on ? (
            <span className="font-semibold text-emerald-400" title="ChatGPT can reach a read-mostly Panya">
              On · until {until}
            </span>
          ) : (
            <span>Off</span>
          )}
        </span>
        {local && r.on && (
          <button className={btn} onClick={() => stop.mutate()} disabled={stop.isPending}>
            Turn off
          </button>
        )}
      </div>

      {local && !r.on && ready && (
        <div className="mt-1.5 flex items-center gap-1 pl-[22px]">
          <span className="mr-1">On for</span>
          {HOURS.map((h) => (
            <button key={h} className={btn} onClick={() => start.mutate(h)} disabled={start.isPending}>
              {h} h
            </button>
          ))}
        </div>
      )}

      {!ready && (
        <ul className="mt-1.5 space-y-0.5 pl-[22px] text-[11px]" title="See docs/REMOTE_ACCESS.md">
          {(
            [
              ["tunnel", "Tunnel ID saved"],
              ["key", "Tunnel key saved"],
              ["binary", "tunnel-client installed"],
            ] as const
          ).map(([k, label]) => (
            <li key={k} className="flex items-center gap-1">
              {r.setup[k] ? <Check size={11} className="text-emerald-400" /> : <X size={11} className="text-rose-400" />} {label}
            </li>
          ))}
        </ul>
      )}

      {r.error && <p className="mt-1 pl-[22px] text-[11px] text-rose-400">{r.error}</p>}
    </div>
  );
}
