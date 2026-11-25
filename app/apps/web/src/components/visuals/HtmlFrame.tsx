/**
 * Imported HTML visual, sandboxed (SPEC §4.16):
 * - <iframe sandbox="allow-scripts"> without allow-same-origin → an opaque origin: no access to the app, its
 *   cookies, storage or API; no top navigation, popups or form submission.
 * - CSP inside the frame: no network at all (scripts/styles inline only; images, fonts and media only data:/blob:),
 *   so nothing can be loaded from or sent anywhere.
 * - The few allowed libraries (Chart.js, D3, Plotly basic) are referenced as <script src="/vendor/…">; the app reads
 *   them from its own /vendor/ folder and inlines them before the frame starts.
 */
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

const VENDOR = ["chart.umd.js", "d3.min.js", "plotly-basic.min.js"];
const VENDOR_TAG = /<script\s+src\s*=\s*["']\/vendor\/([\w.-]+)["']\s*>\s*<\/script>/g;

export function HtmlFrame({ html, height = 420, title }: { html: string; height?: number; title: string }) {
  // The frame's color-scheme must match the app's, or the browser paints it opaque white in dark mode.
  const dark = document.documentElement.classList.contains("dark");
  const libs = useMemo(() => [...new Set([...html.matchAll(VENDOR_TAG)].map((m) => m[1]!).filter((f) => VENDOR.includes(f)))], [html]);
  const code = useQueries({
    queries: libs.map((f) => ({
      queryKey: ["vendor", f],
      queryFn: () => fetch(`/vendor/${f}`).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${f} not found`)))),
      staleTime: Infinity,
    })),
  });
  const ready = code.every((q) => q.data !== undefined || q.error);
  const doc = useMemo(() => {
    if (!ready) return "";
    const csp = [
      "default-src 'none'",
      "script-src 'unsafe-inline' 'unsafe-eval'",
      "style-src 'unsafe-inline'",
      "img-src data: blob:",
      "font-src data:",
      "media-src data: blob:",
      "connect-src 'none'",
      "form-action 'none'",
      "frame-src 'none'",
      "base-uri 'none'",
    ].join("; ");
    const src = new Map(libs.map((f, i) => [f, code[i]?.data]));
    const fixed = html.replace(VENDOR_TAG, (m, f: string) => {
      const js = src.get(f);
      return js === undefined ? m : `<script>${js.replace(/<\/script/gi, "<\\/script")}</script>`;
    });
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="color-scheme" content="${dark ? "dark" : "light"}"><style>html,body{margin:0;font-family:system-ui,sans-serif;background:transparent;color:${dark ? "#e2e8f0" : "#0f172a"}}</style></head><body>${fixed}</body></html>`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, dark, ready, ...code.map((q) => q.data)]);
  if (!ready) return <div className="w-full animate-pulse rounded-lg bg-[var(--lane)]" style={{ height }} />;
  return (
    <iframe
      title={title}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={doc}
      className="w-full rounded-lg bg-[var(--panel-solid)] ring-1 ring-[var(--line)]"
      style={{ height, colorScheme: dark ? "dark" : "light" }}
    />
  );
}
