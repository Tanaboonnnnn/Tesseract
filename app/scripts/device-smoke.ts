/** Production UI smoke; runs only on loopback, with temporary fixtures and a generated pairing token. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { Store } from "@tesseract/core";
import { createApp } from "../apps/server/src/app.ts";

const playwrightEntry = process.env.TESSERACT_PLAYWRIGHT_ENTRY;
if (!playwrightEntry) throw new Error("Set TESSERACT_PLAYWRIGHT_ENTRY to the absolute path of a Playwright Core index.mjs");
const { chromium, devices } = await import(pathToFileURL(resolve(playwrightEntry)).href);
const appDir = dirname(import.meta.dirname);
const temp = mkdtempSync(join(tmpdir(), "tesseract-browser-qa-"));
const dataDir = join(temp, "data");
const token = randomBytes(24).toString("base64url");
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let server: ReturnType<typeof serve> | undefined;
function closeHost() {
  const closing = server;
  server = undefined;
  return new Promise<void>((r, reject) => {
    if (!closing) return r();
    closing.close((error) => error ? reject(error) : r());
    closing.closeAllConnections?.();
  });
}

try {
  cpSync(join(appDir, "fixtures/sample-data"), dataDir, { recursive: true });
  const makeApp = (port: number) => createApp(new Store({ dataDir, agent: "device-qa" }), {
    allowedHosts: [`127.0.0.1:${port}`, `tesseract-device.localhost:${port}`],
    webDir: join(appDir, "apps/web/dist"),
    token,
  });
  let port = 0;
  function startHost() {
    return new Promise<void>((r, reject) => {
      let app = makeApp(port);
      server = serve({ fetch: (req, ...rest) => app.fetch(req, ...rest), port, hostname: "127.0.0.1" }, (info) => {
        port = info.port;
        app = makeApp(port);
        r();
      });
      server.once("error", reject);
    });
  }
  await startHost();
  const pc = `http://127.0.0.1:${port}`;
  const device = `http://tesseract-device.localhost:${port}`;
  const hostSession = await fetch(pc + "/api/session");
  assert.equal(hostSession.status, 200);
  assert.equal(hostSession.headers.get("cache-control"), "no-store");

  browser = await chromium.launch({ headless: true, executablePath: process.env.TESSERACT_CHROMIUM });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const android = await browser.newContext({ ...devices["Pixel 7"] });
  const tablet = await browser.newContext({ ...devices["iPad Pro 11"] });
  const dp = await desktop.newPage();
  const phone = await android.newPage();
  const ipad = await tablet.newPage();
  for (const page of [dp, phone, ipad]) page.setDefaultTimeout(8_000);
  const note = "/notes/why-typescript-monorepo";
  const quiz = "/quizzes/2026-11-23-kubernetes-deployments";
  await dp.goto(pc + note);
  await dp.getByRole("heading", { name: /typescript/i }).first().waitFor();
  console.log("PASS desktop opens note without pairing");
  await phone.goto(device + note);
  assert.equal(await phone.evaluate(async () => (await fetch("/api/notes")).status), 401);
  await phone.getByLabel("Access token").fill("not-the-test-token");
  await phone.getByRole("button", { name: "Pair device" }).click();
  await phone.getByText("Wrong token", { exact: false }).waitFor();
  await phone.getByLabel("Access token").fill(token);
  await phone.getByRole("button", { name: "Pair device" }).click();
  await phone.getByRole("heading", { name: /typescript/i }).first().waitFor();
  const pairPosts: number[] = [];
  ipad.on("response", (r: { url(): string; status(): number }) => {
    if (r.url().endsWith("/api/pair")) pairPosts.push(r.status());
  });
  await ipad.goto(device + note + "#pair=" + encodeURIComponent(token));
  await ipad.getByRole("heading", { name: /typescript/i }).first().waitFor();
  assert.equal(new URL(ipad.url()).hash, "");
  assert.deepEqual(pairPosts, [200]);
  assert((await tablet.cookies()).some((c: { httpOnly: boolean }) => c.httpOnly));
  console.log("PASS Android viewport manual pairing and iPad viewport QR-fragment pairing");

  await phone.goto(device + quiz);
  await phone.getByRole("button", { name: "Submit", exact: true }).waitFor();
  const groups = phone.locator("fieldset");
  for (const g of await groups.all()) {
    const options = g.locator('input[type="radio"], input[type="checkbox"]');
    if (await options.count()) await options.first().check();
    else await g.getByRole("textbox").fill("example");
  }
  phone.once("dialog", (dialog: { accept(): Promise<void> }) => dialog.accept());
  await phone.getByRole("button", { name: "Submit", exact: true }).click();
  await phone.getByText(/correct\. Saved as an assessment/).waitFor();
  await dp.goto(pc + quiz);
  await dp.getByText("Score", { exact: true }).waitFor();
  await phone.reload();
  await phone.getByText("Score", { exact: true }).waitFor();
  console.log("PASS Android quiz result survives reload and is shared with desktop");

  await ipad.goto(device + note);
  await ipad.getByRole("heading", { name: /typescript/i }).first().waitFor();
  const cachesAreClean = await ipad.evaluate(async () => {
    for (const key of await caches.keys()) {
      for (const req of await (await caches.open(key)).keys()) {
        if (new URL(req.url).pathname.startsWith("/api/")) return false;
      }
    }
    return true;
  });
  assert(cachesAreClean);
  await closeHost();
  await ipad.getByRole("status").filter({ hasText: "Cannot reach the host" }).waitFor({ timeout: 24_000 });
  assert.equal(await ipad.getByRole("heading", { name: /typescript/i }).first().isVisible(), true);
  await startHost();
  await ipad.getByRole("button", { name: "Check again" }).click();
  await ipad.getByRole("status").filter({ hasText: "Cannot reach the host" }).waitFor({ state: "hidden" });
  await ipad.getByRole("heading", { name: /typescript/i }).first().waitFor();
  console.log("PASS host outage is reported and recovery does not require re-pairing");
} finally {
  try { await browser?.close(); }
  finally {
    await closeHost();
    rmSync(temp, { recursive: true, force: true });
  }
}
