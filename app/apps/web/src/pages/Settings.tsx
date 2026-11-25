/**
 * Settings (SPEC §6): appearance (layout, colours, mode, transparency), phone & tablet access, remote access.
 * Everything here is per device except the two access switches, which only this PC can change.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Smartphone } from "lucide-react";
import { useMemo, useState } from "react";
import { renderSVG } from "uqr";
import { RemoteAccess } from "../components/RemoteAccess.tsx";
import { ThemeToggle } from "../components/ThemeToggle.tsx";
import { TransparencySlider } from "../components/TransparencySlider.tsx";
import { Button, Card, ErrorNote, PageHeader, SectionTitle } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { withPairingAppearance } from "../lib/pairing.ts";
import { cn } from "../lib/format.ts";
import { LAYOUTS, type LayoutId, PALETTES, usePalette, useLayout } from "../lib/theme.ts";

export function Settings() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Saved on this device. Access switches can only be changed on this PC." />
      <Card className="mb-6">
        <SectionTitle>Layout</SectionTitle>
        <LayoutPicker />
      </Card>
      <Card className="mb-6">
        <SectionTitle>Colours</SectionTitle>
        <PalettePicker />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs text-slate-500">Mode</p>
            <ThemeToggle />
          </div>
          <div>
            <p className="mb-2 text-xs text-slate-500">Transparency (cards and, in the desktop app, the window)</p>
            <TransparencySlider />
          </div>
        </div>
      </Card>
      <Card className="mb-6">
        <SectionTitle>Phone &amp; tablet</SectionTitle>
        <PhoneAccess />
      </Card>
      <Card className="mb-6">
        <SectionTitle>OpenAI Tunnel</SectionTitle>
        <RemoteAccess settings />
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Lets ChatGPT on the web or your phone reach a read-mostly Tesseract through OpenAI's outbound-only tunnel. Setup: docs/REMOTE_ACCESS.md.</p>
      </Card>
    </>
  );
}

/* ---------- layout ---------- */

function LayoutPicker() {
  const [layout, setLayout] = useLayout();
  const [palette, setPalette] = usePalette();
  const current = LAYOUTS.find((l) => l.id === layout)!;
  const suggested = PALETTES.find((p) => p.id === current.palette)!;
  return (
    <>
      <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">Switching layouts applies its matching colours. You can choose another palette below.</p>
      <div role="radiogroup" aria-label="Layout" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {LAYOUTS.map((l) => (
          <button
            key={l.id}
            role="radio"
            aria-checked={l.id === layout}
            aria-label={l.name}
            onClick={() => setLayout(l.id)}
            className={cn(
              "group rounded-xl p-2 text-left ring-1 transition",
              l.id === layout ? "bg-[var(--lane)] ring-2 ring-accent-500" : "ring-[var(--line)] hover:ring-accent-400/60",
            )}
          >
            <Mini id={l.id} />
            <p className="mt-2 flex items-center gap-1 text-sm font-semibold">
              {l.id === layout && <Check size={14} className="text-accent-600 dark:text-sky-300" />}
              {l.name}
            </p>
            <p className="text-[11px] leading-snug text-slate-500">{l.hint}</p>
          </button>
        ))}
      </div>
      {palette !== suggested.id && (
        <p className="mt-3 text-xs text-slate-500">
          Made for this layout:{" "}
          <button className="font-medium text-accent-600 hover:underline dark:text-sky-300" onClick={() => setPalette(suggested.id)}>
            use {suggested.name} colours
          </button>
        </p>
      )}
    </>
  );
}

/** Tiny wireframe of each layout, drawn in the current colours. */
function Mini({ id }: { id: LayoutId }) {
  const box = "h-20 w-full overflow-hidden rounded-md bg-[var(--bg)] ring-1 ring-[var(--line)]";
  const card = "rounded-[3px] bg-[var(--panel-solid)] ring-1 ring-[var(--line)]";
  const accent = { background: "var(--color-accent-500)" };
  if (id === "insights") {
    return (
      <div aria-hidden="true" className="flex h-20 gap-1.5 rounded-md border border-[#dae1d6] bg-[#f9faf8] p-1.5">
        <span className="w-2.5 rounded-sm bg-[#dfe9d9]" />
        <span className="w-6 rounded-sm border border-[#e2e7df] bg-white" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="h-2 rounded-sm border border-[#e2e7df] bg-white" />
          <span className="grid grid-cols-3 gap-1">{[1, 2, 3].map((n) => <i key={n} className="h-3 rounded-sm bg-[#e4f0db]" />)}</span>
          <span className="grid flex-1 grid-cols-2 gap-1">{[1, 2].map((n) => <i key={n} className="rounded-sm border border-[#e2e7df] bg-white" />)}</span>
        </span>
      </div>
    );
  }
  if (id === "linear" || id === "notion" || id === "editorial") {
    const editorial = id === "editorial";
    const paper = id === "notion";
    return (
      <div aria-hidden="true" className={cn(box, "flex p-2 gap-2", editorial && "flex-col")}>
        {editorial ? (
          <div className="flex flex-col items-center gap-1 border-b border-[var(--line)] pb-1">
            <i className="h-1.5 w-14 rounded-full" style={accent} />
            <div className="flex gap-1">{[1, 2, 3, 4].map((i) => <i key={i} className="h-0.5 w-3 rounded bg-[var(--line-strong)]" />)}</div>
          </div>
        ) : (
          <div className={cn(card, "flex flex-col gap-1.5 p-1.5", paper ? "w-12" : "w-9")}>
            <i className="h-1 w-full rounded" style={accent} />
            {[1, 2, 3, 4].map((i) => <i key={i} className="h-0.5 rounded bg-[var(--line-strong)]" />)}
          </div>
        )}
        <div className={cn("flex flex-1 flex-col gap-1.5", editorial && "items-center pt-1")}>
          {paper && <i className="mb-1 h-0.5 w-1/2 bg-[var(--line-strong)]" />}
          <i className="h-1 w-2/5 rounded" style={accent} />
          <div className={cn("grid min-h-0 flex-1 gap-1", !paper && !editorial && "grid-cols-2", editorial && "w-3/4 grid-cols-2")}>
            <div className={card} /><div className={card} />
          </div>
        </div>
      </div>
    );
  }
  if (id === "system")
    return (
      <div className={cn(box, "flex")}>
        <div className="w-1/4 bg-[var(--color-sidebar)] p-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="mb-1 h-1 rounded-full" style={{ background: i === 0 ? "var(--color-sky-400)" : "rgb(148 163 184 / 0.35)" }} />
          ))}
        </div>
        <div className="grid flex-1 grid-cols-2 gap-1 p-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={card} style={{ boxShadow: "inset 0 0 0 1px var(--corner)" }} />
          ))}
        </div>
      </div>
    );
  if (id === "minimal")
    return (
      <div className={box}>
        <div className="flex items-center gap-1 border-b border-[var(--line)] px-2 py-1">
          <div className="size-1.5 rounded-full" style={accent} />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-1 w-3 rounded-full bg-slate-400/40" />
          ))}
        </div>
        <div className="mx-auto w-3/4 space-y-1.5 pt-2">
          <div className="h-1.5 w-1/3 rounded-full bg-slate-500/50" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-px bg-[var(--line)]" />
          ))}
          <div className="h-1 w-1/2 rounded-full bg-slate-400/40" />
        </div>
      </div>
    );
  if (id === "bento")
    return (
      <div className={cn(box, "flex")}>
        <div className="flex w-3 flex-col items-center gap-1 py-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="size-1.5 rounded-full" style={i === 0 ? accent : { background: "rgb(148 163 184 / 0.4)" }} />
          ))}
        </div>
        <div className="grid flex-1 grid-cols-3 grid-rows-2 gap-1 p-1.5">
          <div className={cn(card, "col-span-2 rounded-lg")} />
          <div className={cn(card, "grid place-items-center rounded-lg")}>
            <div className="size-4 rounded-full border-2" style={{ borderColor: "var(--color-accent-500)", borderRightColor: "var(--line)" }} />
          </div>
          <div className={cn(card, "rounded-lg")} />
          <div className={cn(card, "col-span-2 rounded-lg")} />
        </div>
      </div>
    );
  if (id === "notebook")
    return (
      <div className={cn(box, "flex")}>
        <div className="flex w-4 flex-col gap-0.5 pt-2">
          {["#e8a87c", "#c3d98e", "#8ecfd9", "#b8a6e0"].map((c) => (
            <div key={c} className="h-2.5 rounded-r-sm" style={{ background: c }} />
          ))}
        </div>
        <div className="flex-1 p-1.5">
          <div
            className={cn(card, "h-full")}
            style={{ backgroundImage: "repeating-linear-gradient(to bottom, transparent 0 6px, var(--line) 6px 7px)", boxShadow: "inset 0 2px 0 var(--color-accent-400)" }}
          />
        </div>
      </div>
    );
  return (
    <div className={cn(box, "p-1.5 font-mono text-[7px] leading-[9px]")} style={{ color: "var(--color-sky-400)" }}>
      <div className="mb-1 border-b border-[var(--line-strong)] pb-0.5">[home] schedule projects</div>
      <div>$ overview</div>
      <div>&gt; weather [#####---]</div>
      <div>&gt; review 7 topics</div>
      <div className="mt-1 bg-[var(--line)] px-0.5">[0] tesseract · 02:53</div>
    </div>
  );
}

/* ---------- colours ---------- */

function PalettePicker() {
  const [palette, setPalette] = usePalette();
  return (
    <div role="radiogroup" aria-label="Colours" className="flex flex-wrap gap-3">
      {PALETTES.map((p) => (
        <button
          key={p.id}
          role="radio"
          aria-checked={p.id === palette}
          onClick={() => setPalette(p.id)}
          className={cn(
            "flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-xs ring-1 transition",
            p.id === palette ? "font-semibold ring-2 ring-accent-500" : "ring-[var(--line)] hover:ring-accent-400/60",
          )}
        >
          <span className="size-6 rounded-full" style={{ background: `conic-gradient(from 210deg, ${p.swatch[0]} 0 33%, ${p.swatch[1]} 0 66%, ${p.swatch[2]} 0)` }} />
          {p.name}
        </button>
      ))}
    </div>
  );
}

/* ---------- phone & tablet ---------- */

function PhoneAccess() {
  const [layout] = useLayout();
  const [palette] = usePalette();
  const qc = useQueryClient();
  const phone = useQuery({ queryKey: ["phone"], queryFn: api.phone });
  const session = useQuery({ queryKey: ["session"], queryFn: api.session, staleTime: Infinity });
  const toggle = useMutation({
    // The server switches its listening address in-process right after replying; wait until it reports the new
    // state (requests can fail for a moment during the switch). No page reload, so the window never goes blank.
    mutationFn: async (on: boolean) => {
      await api.setPhone(on).catch((e) => (e instanceof TypeError ? null : Promise.reject(e)));
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const now = await api.phone().catch(() => null);
        if (now?.available && now.on === on) return now;
      }
      throw new Error("The switch did not apply. Close this window and open Tesseract again from the Start menu.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["phone"] }),
  });
  const [pick, setPick] = useState(0);
  const p = phone.data;
  const pairUrl = p?.available ? (p.pairUrls?.[pick] ?? p.pairUrls?.[0]) : undefined;
  const qr = useMemo(() => pairUrl
    ? renderSVG(withPairingAppearance(pairUrl, layout, palette), { border: 2, whiteColor: "#ffffff", blackColor: "#0b1020" })
    : null, [pairUrl, layout, palette]);

  if (!p) return null;
  if (p.available && p.on && p.urls.length === 0) {
    return <p className="text-sm text-amber-600">Phone access is on, but no Wi-Fi or Tailscale address was found. Connect the PC to Wi-Fi (or start Tailscale) and turn it off and on again.</p>;
  }
  if (!p.available) {
    return <p className="text-sm text-slate-500">Available in the desktop app (Start menu → Tesseract). From a terminal: <code>npm run lan</code>, see docs/MOBILE.md.</p>;
  }
  const local = !!session.data?.local;
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Smartphone size={18} className={p.on ? "text-emerald-500" : "text-slate-400"} />
        <span className="flex-1">
          Phone &amp; tablet access is <strong>{p.on ? "on" : "off"}</strong>
          {p.on ? " (paired devices on your Wi-Fi or Tailscale)." : ". Only this PC can open the app."}
        </span>
        {local && (
          <Button variant={p.on ? "ghost" : "primary"} disabled={toggle.isPending} onClick={() => toggle.mutate(!p.on)}>
            {toggle.isPending ? (p.on ? "Turning off…" : "Turning on…") : p.on ? "Turn off" : "Turn on"}
          </Button>
        )}
      </div>
      <ErrorNote error={toggle.error} />

      {p.on && qr && (
        <div className="flex flex-wrap items-start gap-5">
          <div className="size-44 shrink-0 rounded-lg bg-white p-1" aria-label="Pairing QR code" dangerouslySetInnerHTML={{ __html: qr }} />
          <ol className="list-decimal space-y-1.5 pl-5 text-slate-600 dark:text-slate-300">
            <li>Scan with the phone or iPad camera (same Wi-Fi, or Tailscale on both).</li>
            <li>It opens Tesseract with this computer’s current layout and colours. Scan again to copy a new look.</li>
            <li>
              Add to home screen: iPhone/iPad Safari → Share → <em>Add to Home Screen</em>; Android → ⋮ → <em>Add to Home screen</em>.
            </li>
            <li className="text-xs text-slate-500">
              The QR holds the pairing key: don't share screenshots of it. The first time, allow Node.js on <em>Private</em> networks if Windows asks.
            </li>
            {p.urls.length > 1 && (
              <li className="list-none">
                <span className="mr-2 text-xs text-slate-500">QR for:</span>
                {p.urls.map((u, i) => (
                  <button key={u} onClick={() => setPick(i)} className={cn("mr-1 rounded px-1.5 py-0.5 text-xs ring-1", i === pick ? "ring-accent-500" : "ring-[var(--line)]")}>
                    {u.replace("http://", "")}
                  </button>
                ))}
              </li>
            )}
            {p.urls.length === 1 && <li className="list-none text-xs text-slate-500">Address: {p.urls[0]}</li>}
          </ol>
        </div>
      )}
      {p.on && !local && <p className="text-xs text-slate-500">You're on a paired device. The pairing code is only shown on the PC.</p>}
    </div>
  );
}
