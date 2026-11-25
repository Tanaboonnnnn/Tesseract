import { describe, expect, it } from "vitest";
import { checkExpr, compile, derivative, ExprError } from "../src/expr.ts";

describe("safe expressions", () => {
  it("evaluates arithmetic, precedence, powers and functions", () => {
    const f = compile("a*x^2 + 2*x - 3", ["x", "a"]);
    expect(f({ x: 3, a: 2 })).toBe(21);
    expect(compile("-2^2", [])({})).toBe(-4); // unary minus binds looser than ^
    expect(compile("2^3^2", [])({})).toBe(512); // right-associative
    expect(compile("sin(pi/2) + sqrt(16) + max(1, 5, 3)", [])({})).toBeCloseTo(10);
    expect(compile("normpdf(0, 0, 1)", [])({})).toBeCloseTo(0.3989, 4);
    expect(compile("x**2", ["x"])({ x: 4 })).toBe(16);
  });

  it("rejects anything that is not math", () => {
    for (const bad of ["constructor", "x.constructor", "process", "toString(x)", "__proto__", "x[0]", "alert(1)", "`x`", "x;y", "a=1"]) {
      expect(checkExpr(bad, ["x"]), bad).not.toBeNull();
    }
    expect(() => compile("y + 1", ["x"])).toThrow(ExprError);
    expect(checkExpr("max(1)", [])).toMatch(/2–8 argument/);
    expect(checkExpr("x".repeat(501), ["x"])).toMatch(/too long/);
  });

  it("takes numeric derivatives", () => {
    const f = compile("x^3", ["x"]);
    expect(derivative((x) => f({ x }), 2)).toBeCloseTo(12, 4);
  });
});
