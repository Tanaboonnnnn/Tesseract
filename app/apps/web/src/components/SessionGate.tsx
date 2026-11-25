import { useMutation, useQuery } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "../lib/api.ts";
import { parsePairingFragment, type PairingHint } from "../lib/pairing.ts";
import { applyPairedAppearance } from "../lib/theme.ts";
import { Button, ErrorNote, inputClass } from "./ui.tsx";

/**
 * On this computer the API answers right away. On a phone (LAN / Tailscale) it answers 401
 * until the device is paired once with the access token printed by `npm run lan`.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const [fromLink, setFromLink] = useState(() => parsePairingFragment(location.hash));
  useEffect(() => {
    // Scanning again can navigate to a new hash on the already-open page.
    const readLink = () => {
      const hint = parsePairingFragment(location.hash);
      if (!hint) return;
      history.replaceState(history.state, "", location.pathname + location.search);
      setFromLink(hint);
    };
    readLink();
    window.addEventListener("hashchange", readLink);
    return () => window.removeEventListener("hashchange", readLink);
  }, []);
  const session = useQuery({
    queryKey: ["session"], queryFn: api.session, retry: false, networkMode: "always",
    refetchInterval: ({ state }) => {
      const code = state.error instanceof ApiError ? state.error.status : null;
      if (code === 401 || code === 403 || (state.data?.local && state.error === null)) return false;
      return 12_000;
    },
  });
  const err = session.error instanceof ApiError ? session.error : null;

  if (session.isPending) return <div className="min-h-dvh" />;
  if (err?.status === 401 || (fromLink && session.data?.local === false)) return <Pair fromLink={fromLink} />;
  if (err?.status === 403) {
    return (
      <Screen>
        <p className="text-sm text-slate-500">Phone access is off. On the computer: Settings → Phone &amp; tablet → turn it on.</p>
      </Screen>
    );
  }

  const notice = (
    <div role="status" className="flex flex-wrap items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm">
      <span><strong>Cannot reach the host.</strong> Keep your computer on and check the connection before saving changes.</span>
      <Button type="button" disabled={session.isFetching} onClick={() => void session.refetch()}>Check again</Button>
    </div>
  );
  if (session.isError && !session.data) return <Screen>{notice}</Screen>;
  // Keep the open screen and its unsaved input mounted during a transient disconnect.
  return <>{session.isError && notice}{children}</>;
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

function Pair({ fromLink }: { fromLink: PairingHint | null }) {
  const [token, setToken] = useState(fromLink?.token ?? "");
  const handled = useRef<PairingHint | null>(null);
  const pair = useMutation({
    mutationFn: ({ token }: { token: string; hint?: PairingHint }) => api.pair(token.trim()),
    onSuccess: (_result, { hint }) => {
      if (hint) applyPairedAppearance(hint.layout, hint.palette);
      location.reload();
    },
  });
  useEffect(() => {
    if (!fromLink || fromLink === handled.current) return;
    handled.current = fromLink;
    setToken(fromLink.token);
    pair.mutate({ token: fromLink.token, hint: fromLink });
  }, [fromLink, pair.mutate]);
  return (
    <Screen>
      <p className="mb-4 text-sm text-slate-500">Pair this device once with the access token shown on your computer.</p>
      <form
        className="space-y-3 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          if (token.trim()) pair.mutate({ token });
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
