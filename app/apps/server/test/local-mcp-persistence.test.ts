import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "@tesseract/core";
import { expect, it } from "vitest";
import { localMcpControl, windowsLocalMcpPersistence, type SavedLocalMcpLink } from "../src/local-mcp.ts";

it("restores the same loopback URL after a server restart, never leaks it from state, and revokes on Stop", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tesseract-saved-mcp-"));
  let record: SavedLocalMcpLink | null = null;
  const persistence = { load: () => record, save: (value: SavedLocalMcpLink) => { record = value; }, remove: () => { record = null; } };
  const store = new Store({ dataDir:dir, agent:"persistent-link-test" });
  const first = localMcpControl(store, persistence);
  const reopened = localMcpControl(store, persistence);
  const later = localMcpControl(store, persistence);
  const busy = createServer();
  try {
    const ephemeral = await first.start("link");
    const before = await first.remember();
    expect(before).toMatchObject({ on:true, mode:"link", remembered:true, url:ephemeral?.url });
    expect(first.state()).not.toHaveProperty("url");
    if (!before || !("url" in before)) throw new Error("Expected a saved URL");
    const expected = before.url;
    await first.close();
    const port = Number(new URL(expected).port);
    await new Promise<void>((resolve,reject)=>busy.once("error",reject).listen(port,"127.0.0.1",resolve));
    await reopened.restore();
    expect(reopened.state()).toMatchObject({on:false, remembered:true, restoreError:expect.any(String)});
    expect(JSON.stringify(reopened.state())).not.toContain(expected);
    await new Promise<void>((resolve,reject)=>busy.close(e=>e?reject(e):resolve()));
    await reopened.restore();
    expect(reopened.state()).toMatchObject({on:true, mode:"link", remembered:true});
    expect((await reopened.start("link"))?.url).toBe(expected);
    const rpc = JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/list",params:{}});
    const r = await fetch(expected,{method:"POST",headers:{Accept:"application/json, text/event-stream","Content-Type":"application/json"},body:rpc});
    const {result}=await r.json();
    expect(result.tools.map((x:{name:string})=>x.name)).not.toContain("create_course");
    await reopened.stop();
    expect(record).toBeNull();
    await later.restore();
    expect(later.state()).toMatchObject({on:false,remembered:false});
    const next = await later.remember();
    if (!next || !("url" in next)) throw new Error("Expected a new saved URL");
    expect(next.url).not.toBe(expected);
  } finally {
    if(busy.listening) busy.close();
    await Promise.all([first.close(),reopened.close(),later.close()]);
    rmSync(dir,{recursive:true,force:true});
  }
});

it.runIf(process.platform === "win32")("does not transfer a saved URL to an upgrade copy with a new data path", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tesseract-saved-mcp-upgrade-"));
  const oldPath = join(dir, "old", "data");
  const newPath = join(dir, "new", "data");
  const vault = join(dir, "vault");
  mkdirSync(oldPath, {recursive:true});
  const older = localMcpControl(new Store({dataDir:oldPath,agent:"older"}),windowsLocalMcpPersistence(oldPath,vault));
  let copied: ReturnType<typeof localMcpControl> | undefined;
  let samePath: ReturnType<typeof localMcpControl> | undefined;
  try {
    const old = await older.remember();
    if (!old || !("url" in old)) throw new Error("Expected a saved URL");
    await older.close();
    cpSync(oldPath,newPath,{recursive:true});
    copied = localMcpControl(new Store({dataDir:newPath,agent:"copied"}),windowsLocalMcpPersistence(newPath,vault));
    await copied.restore();
    expect(copied.state()).toMatchObject({on:false,remembered:false});
    const next = await copied.remember();
    if (!next || !("url" in next)) throw new Error("Expected a saved URL for the copy");
    expect(new URL(next.url).pathname).not.toBe(new URL(old.url).pathname);
    await copied.stop();
    samePath=localMcpControl(new Store({dataDir:oldPath,agent:"same-path-upgrade"}),windowsLocalMcpPersistence(oldPath,vault));
    await samePath.restore();
    expect(await samePath.start("link")).toMatchObject({url:old.url,remembered:true});
  } finally {
    await Promise.all([older.close(),copied?.close(),samePath?.close()]);
    rmSync(dir,{recursive:true,force:true});
  }
},20_000);
