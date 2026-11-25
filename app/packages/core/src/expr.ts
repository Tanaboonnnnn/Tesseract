/**
 * Safe math expressions for plots and simulations (SPEC §4.16). No eval / Function: a tiny recursive-descent
 * parser over numbers, variables, + − × ÷ ^, unary minus, parentheses and a fixed set of functions/constants.
 * Unknown names are rejected at parse time, so an expression can never reach JavaScript objects.
 *   compile("a*x^2 + sin(x)", ["x", "a"])  →  (vars) => number
 */

type Node =
  | { k: "num"; v: number }
  | { k: "var"; name: string }
  | { k: "neg"; a: Node }
  | { k: "bin"; op: "+" | "-" | "*" | "/" | "^"; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[] };

const FUNCS: Record<string, { n: number | [number, number]; f: (...a: number[]) => number }> = {
  sin: { n: 1, f: Math.sin }, cos: { n: 1, f: Math.cos }, tan: { n: 1, f: Math.tan },
  asin: { n: 1, f: Math.asin }, acos: { n: 1, f: Math.acos }, atan: { n: 1, f: Math.atan },
  sinh: { n: 1, f: Math.sinh }, cosh: { n: 1, f: Math.cosh }, tanh: { n: 1, f: Math.tanh },
  exp: { n: 1, f: Math.exp }, ln: { n: 1, f: Math.log }, log: { n: 1, f: Math.log10 }, log2: { n: 1, f: Math.log2 },
  sqrt: { n: 1, f: Math.sqrt }, abs: { n: 1, f: Math.abs }, floor: { n: 1, f: Math.floor }, ceil: { n: 1, f: Math.ceil },
  round: { n: 1, f: Math.round }, sign: { n: 1, f: Math.sign },
  min: { n: [2, 8], f: Math.min }, max: { n: [2, 8], f: Math.max }, pow: { n: 2, f: Math.pow },
  sigmoid: { n: 1, f: (x) => 1 / (1 + Math.exp(-x)) },
  relu: { n: 1, f: (x) => Math.max(0, x) },
  normpdf: { n: 3, f: (x, mu, s) => Math.exp(-((x - mu) ** 2) / (2 * s * s)) / (s * Math.sqrt(2 * Math.PI)) },
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export class ExprError extends Error {}

function tokenize(src: string): string[] {
  if (src.length > 500) throw new ExprError("expression is too long (max 500 characters)");
  const out: string[] = [];
  const re = /\s*(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?|[a-zA-Z_][a-zA-Z0-9_]*|\*\*|[-+*/^(),])/y;
  let i = 0;
  while (i < src.length) {
    if (/^\s*$/.test(src.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new ExprError(`unexpected character "${src.slice(i).trim()[0]}" in "${src}"`);
    out.push(m[1] === "**" ? "^" : m[1]!);
    i = re.lastIndex;
  }
  return out;
}

function parse(src: string, vars: readonly string[]): Node {
  const t = tokenize(src);
  let p = 0;
  const peek = () => t[p];
  const eat = (s?: string) => {
    const v = t[p];
    if (s !== undefined && v !== s) throw new ExprError(`expected "${s}" in "${src}"`);
    p++;
    return v;
  };
  // expr := term (('+'|'-') term)*   term := unary (('*'|'/') unary)*   unary := '-' unary | power   power := atom ('^' unary)?
  const expr = (): Node => {
    let a = term();
    while (peek() === "+" || peek() === "-") a = { k: "bin", op: eat() as "+" | "-", a, b: term() };
    return a;
  };
  const term = (): Node => {
    let a = unary();
    while (peek() === "*" || peek() === "/") a = { k: "bin", op: eat() as "*" | "/", a, b: unary() };
    return a;
  };
  const unary = (): Node => (peek() === "-" ? (eat(), { k: "neg", a: unary() }) : peek() === "+" ? (eat(), unary()) : power());
  const power = (): Node => {
    const a = atom();
    return peek() === "^" ? (eat(), { k: "bin", op: "^", a, b: unary() }) : a;
  };
  const atom = (): Node => {
    const tok = eat();
    if (tok === undefined) throw new ExprError(`unexpected end of "${src}"`);
    if (tok === "(") {
      const a = expr();
      eat(")");
      return a;
    }
    if (/^[\d.]/.test(tok)) return { k: "num", v: Number(tok) };
    if (/^[a-zA-Z_]/.test(tok)) {
      if (peek() === "(") {
        const fn = FUNCS[tok];
        if (!Object.hasOwn(FUNCS, tok) || !fn) throw new ExprError(`unknown function "${tok}"`);
        eat("(");
        const args: Node[] = [];
        if (peek() !== ")") {
          args.push(expr());
          while (peek() === ",") (eat(), args.push(expr()));
        }
        eat(")");
        const [lo, hi] = Array.isArray(fn.n) ? fn.n : [fn.n, fn.n];
        if (args.length < lo || args.length > hi) throw new ExprError(`${tok}() takes ${lo === hi ? lo : `${lo}–${hi}`} argument(s)`);
        return { k: "call", fn: tok, args };
      }
      if (vars.includes(tok)) return { k: "var", name: tok };
      if (Object.hasOwn(CONSTS, tok)) return { k: "num", v: CONSTS[tok]! };
      throw new ExprError(`unknown name "${tok}" (allowed: ${[...vars, ...Object.keys(CONSTS)].join(", ")})`);
    }
    throw new ExprError(`unexpected "${tok}" in "${src}"`);
  };
  const root = expr();
  if (p < t.length) throw new ExprError(`unexpected "${t[p]}" in "${src}"`);
  return root;
}

function run(n: Node, env: Record<string, number>): number {
  switch (n.k) {
    case "num":
      return n.v;
    case "var":
      return env[n.name] ?? NaN;
    case "neg":
      return -run(n.a, env);
    case "call":
      return FUNCS[n.fn]!.f(...n.args.map((a) => run(a, env)));
    case "bin": {
      const a = run(n.a, env);
      const b = run(n.b, env);
      return n.op === "+" ? a + b : n.op === "-" ? a - b : n.op === "*" ? a * b : n.op === "/" ? a / b : a ** b;
    }
  }
}

export type Compiled = (env: Record<string, number>) => number;

/** Parse once, evaluate many times. Throws ExprError with a readable message. */
export function compile(src: string, vars: readonly string[]): Compiled {
  const tree = parse(src, vars);
  return (env) => run(tree, env);
}

/** Validation helper: null when fine, otherwise the problem. */
export function checkExpr(src: string, vars: readonly string[]): string | null {
  try {
    parse(src, vars);
    return null;
  } catch (e) {
    return e instanceof ExprError ? e.message : String(e);
  }
}

/** Central-difference derivative. */
export function derivative(f: (x: number) => number, x: number, h = 1e-5): number {
  return (f(x + h) - f(x - h)) / (2 * h);
}
