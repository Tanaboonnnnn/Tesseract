import type { LayoutId, PaletteId } from "./theme.ts";

export interface PairingHint {
  token: string;
  layout: string | null;
  palette: string | null;
}

/** Keep the pairing credential plus optional appearance in the local URL fragment. */
export function withPairingAppearance(url: string, layout: LayoutId, palette: PaletteId): string {
  const next = new URL(url);
  const params = new URLSearchParams(next.hash.slice(1));
  if (!params.get("pair")) return url;
  params.set("layout", layout);
  params.set("palette", palette);
  next.hash = params.toString();
  return next.toString();
}

export function parsePairingFragment(hash: string): PairingHint | null {
  if (!hash.startsWith("#")) return null;
  const params = new URLSearchParams(hash.slice(1));
  const token = params.get("pair")?.trim();
  if (!token) return null;
  return { token, layout: params.get("layout"), palette: params.get("palette") };
}
