/**
 * Browser-safe part of core (no fs/path): expressions and simulation engines, so the web app can run sims and
 * plots live from the AI's inputs. Import as "@tesseract/core/pure".
 */
export * from "./expr.ts";
export * from "./sims.ts";
