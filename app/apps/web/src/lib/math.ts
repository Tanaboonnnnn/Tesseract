/**
 * LaTeX → MathML with Temml, loaded only on pages that show formulas (code-split). Browsers render MathML natively.
 * \term{id}{…} marks an explained part: it becomes \class{sb-term-id}{…}; that is the only "trusted" command,
 * so links, raw HTML or styles in AI-written LaTeX never render.
 */
type Temml = { renderToString: (tex: string, options?: Record<string, unknown>) => string };
let loading: Promise<Temml> | null = null;

export function loadMath(): Promise<Temml> {
  loading ??= Promise.all([import("temml"), import("temml/dist/Temml-Local.css")]).then(([m]) => ((m as { default?: unknown }).default ?? m) as unknown as Temml);
  return loading;
}

export async function texToMathML(tex: string, display = true): Promise<string> {
  const temml = await loadMath();
  const src = tex.replace(/\\term\{([a-z0-9-]+)\}/g, (_, id: string) => `\\class{sb-term-${id}}`);
  return temml.renderToString(src, {
    displayMode: display,
    throwOnError: false,
    trust: (ctx: { command?: string; class?: string }) => ctx.command === "\\class" && /^sb-term-[a-z0-9-]+$/.test(ctx.class ?? ""),
  });
}
