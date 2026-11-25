import { useMutation, useQuery } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "../lib/api.ts";
import { Button, ErrorNote, inputClass } from "./ui.tsx";

/**
 * On this computer the API answers right away. On a phone (LAN / Tailscale) it answers 401
 * until the device is paired once with the access token printed by `npm run lan`.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const session = useQuery({ queryKey: ["session"], queryFn: api.session, retry: false, refetchOnWindowFocus: false });
  const err = session.error instanceof ApiError ? session.error : null;

  if (session.isPending) return <div className="min-h-dvh" />;
  if (err?.status === 401) return <Pair />;
  if (err?.status === 403) {
    return (
      <Screen>
        <p className="text-sm text-slate-500">Phone access is off. On the computer: Settings → Phone &amp; tablet → turn it on.</p>
      </Screen>
    );
  }
  return <>{children}</>;
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="panel w-full max-w-sm p-6 text-center">
        <div className="mb-4 flex items-center justify-center gap-3">
          <span className="notice-icon">
            <span className="font-display text-lg leading-none font-bold">!</span>
          </span>
          <h1 className="notice-title">Notification</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Token from a scanned pairing QR: http://pc:4320/#pair=… (a URL fragment never reaches the server or its logs). */
function tokenFromLink(): string {
  const m = /[#&]pair=([^&]+)/.exec(location.hash);
  if (!m) return "";
  history.replaceState(null, "", location.pathname + location.search); // drop it from the address bar right away
  return decodeURIComponent(m[1]!);
}

function Pair() {
  const [fromLink] = useState(tokenFromLink);
  const [token, setToken] = useState(fromLink);
  const pair = useMutation({ mutationFn: (t: string) => api.pair(t.trim()), onSuccess: () => location.reload() });
  useEffect(() => {
    if (fromLink) pair.mutate(fromLink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Screen>
      <p className="mb-4 text-sm text-slate-500">Pair this device once with the access token shown on your computer.</p>
      <form
        className="space-y-3 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          if (token.trim()) pair.mutate(token);
        }}
      >
        <label className="relative block">
          <KeyRound size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
          <input
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-label="Access token"
            placeholder="Access token"
            className={`${inputClass} pl-9`}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        <ErrorNote error={pair.error} />
        <Button type="submit" className="w-full" disabled={!token.trim() || pair.isPending}>
          Pair device
        </Button>
      </form>
    </Screen>
  );
}
