/**
 * Remote access switch (Phase 8a): lets ChatGPT (web/phone) reach a read-mostly Tesseract through OpenAI's
 * outbound-only tunnel. Off by default, on for 1 / 8 / 24 hours, then off by itself. Only this PC can switch it.
 * `onDark` = placed on the always-dark sidebar.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Globe, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, type RemoteInfo } from "../lib/api.ts";
import { cn } from "../lib/format.ts";
import { Button, ErrorNote, Field, inputClass } from "./ui.tsx";

const HOURS = [1, 8, 24] as const;

export function RemoteAccess({ onDark = false, className, settings = false }: { onDark?: boolean; className?: string; settings?: boolean }) {
  const qc = useQueryClient();
  const remote = useQuery({ queryKey: ["remote"], queryFn: api.remote, refetchInterval: (q) => (q.state.data?.available && q.state.data.on ? (q.state.data.protectedKey ? (q.state.data.verified ? 5_000 : 1_000) : 60_000) : false) });
  const session = useQuery({ queryKey: ["session"], queryFn: api.session, staleTime: Infinity });
  const set = (r: RemoteInfo) => qc.setQueryData(["remote"], r);
  const start = useMutation({ mutationFn: (hours: number) => api.remoteStart(hours), onSuccess: set });
  const stop = useMutation({ mutationFn: api.remoteStop, onSuccess: set });

  const [configuring, setConfiguring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [setupError, setSetupError] = useState<unknown>(null);
  async function saveSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const id = form.elements.namedItem("tunnelId") as HTMLInputElement;
    const key = form.elements.namedItem("runtimeKey") as HTMLInputElement;
    setSetupError(null);
    setSaving(true);
    const request = api.remoteSetup(id.value, key.value);
    key.value = "";
    try {
      set(await request);
      setConfiguring(false);
    } catch (error) {
      setSetupError(error);
    } finally {
      setSaving(false);
    }
  }

  const r = remote.data;
  if (!r?.available) return null;
  const local = !!session.data?.local;
  const ready = r.setup.binary && r.setup.key && r.setup.tunnel;
  const until = r.until ? new Date(r.until).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;
  const muted = onDark ? "text-slate-400" : "text-slate-600 dark:text-slate-300";
  const btn = cn(
    "rounded px-1.5 py-0.5 text-[11px] ring-1",
    onDark ? "text-slate-300 ring-sky-400/25 hover:text-white" : "text-slate-600 ring-[var(--line)] hover:text-accent-600 dark:text-slate-300",
  );

  return (
    <div className={cn("px-1 text-xs", muted, className)}>
      <div className="flex items-center gap-2">
        <Globe size={14} className={cn("shrink-0", r.on && (r.verified ? "text-emerald-400" : "text-amber-400"))} aria-hidden />
        <span className="flex-1">
          Remote access{" "}
          {r.on ? (
            <span className={cn("font-semibold", r.verified ? "text-emerald-500" : "text-amber-500")} role="status">
              {r.verified ? "Connected" : r.protectedKey ? (r.error ? "Not verified" : "Connecting…") : "Running (unverified)"} · until {until}
            </span>
          ) : (
            <span>Off</span>
          )}
        </span>
        {local && r.on && (
          <button className={btn} onClick={() => stop.mutate()} disabled={stop.isPending}>
            Disconnect
          </button>
        )}
      </div>

      {local && !r.on && ready && (
        <div className="mt-1.5 flex items-center gap-1 pl-[22px]">
          <span className="mr-1">Connect for</span>
          {HOURS.map((h) => (
            <button key={h} className={btn} onClick={() => start.mutate(h)} disabled={start.isPending || saving || configuring}>
              {h} h
            </button>
          ))}
        </div>
      )}

      {(settings || !ready) && (
        <ul className="mt-1.5 space-y-0.5 pl-[22px] text-[11px]" title="See docs/REMOTE_ACCESS.md">
          {(
            [
              ["tunnel", "Tunnel ID saved"],
              ["key", r.protectedKey ? "Runtime key saved in system credentials" : "Runtime key saved"],
              ["binary", "tunnel-client installed"],
            ] as const
          ).map(([k, label]) => (
            <li key={k} className="flex items-center gap-1">
              {r.setup[k] ? <Check size={11} className="text-emerald-400" /> : <X size={11} className="text-rose-400" />} {label}
            </li>
          ))}
        </ul>
      )}

      {settings && !local && <p className="mt-3">Open this page on the main computer to change the tunnel setup.</p>}
      {settings && local && !r.on && (
        <div className="mt-4">
          {!configuring ? (
            <Button type="button" variant="ghost" className="border border-[var(--line)]" onClick={() => setConfiguring(true)}>
              {r.setup.tunnel ? "Update setup" : "Set up tunnel"}
            </Button>
          ) : (
            <form autoComplete="off" className="max-w-lg space-y-3 rounded-lg border border-[var(--line)] p-4" onSubmit={saveSetup}>
              <Field label="Tunnel ID">
                <input name="tunnelId" className={inputClass} placeholder="tunnel_…" required spellCheck={false} maxLength={64} />
              </Field>
              <Field label="Restricted runtime key">
                <input name="runtimeKey" className={inputClass} type="password" autoComplete="new-password" required maxLength={512} />
              </Field>
              <p>Use an OpenAI runtime key restricted to Tunnels: Read + Use. The key is stored on this computer only.</p>
              <p>
                <a className="underline" href="https://platform.openai.com/settings/organization/tunnels" target="_blank" rel="noreferrer">Manage tunnels</a>
                {" · "}
                <a className="underline" href="https://github.com/openai/tunnel-client/releases/latest" target="_blank" rel="noreferrer">Download official tunnel-client</a>
              </p>
              {!r.setup.binary && <p>Install the official runtime in the Tesseract bin folder before connecting. See docs/REMOTE_ACCESS.md.</p>}
              <ErrorNote error={setupError} />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save setup"}</Button>
                <Button type="button" variant="ghost" disabled={saving} onClick={() => { setConfiguring(false); setSetupError(null); }}>Cancel</Button>
              </div>
            </form>
          )}
        </div>
      )}
      {(start.error || stop.error) && <ErrorNote error={start.error ?? stop.error} />}
      {r.error && <p className="mt-1 pl-[22px] text-[11px] text-rose-400">{r.error}</p>}
    </div>
  );
}
