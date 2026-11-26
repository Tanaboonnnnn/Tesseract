import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { desktopIdentity, desktopSessionStatus } from "../../../scripts/desktop-identity.ts";

it("only reuses a matching live build and workspace, including rebuilds at the same path", () => {
  const dir=mkdtempSync(join(tmpdir(),"tesseract-identity-"));
  try {
    const entry=join(dir,"server.mjs"), web=join(dir,"web"), data=join(dir,"data"), other=join(dir,"other");
    for(const d of [web,data,other])mkdirSync(d);
    writeFileSync(entry,"server build 1");
    writeFileSync(join(web,"index.html"),"web build 1");
    const running=desktopIdentity(entry,web,data);
    const session={app:"tesseract",ok:true,local:true,desktop:running};
    expect(desktopSessionStatus(running,session)).toBe("match");
    expect(desktopSessionStatus(running,{app:"tesseract",ok:true,local:true})).toBe("mismatch");
    expect(desktopSessionStatus(running,{app:"unrelated",ok:true,local:true})).toBe("occupied");
    expect(desktopSessionStatus(desktopIdentity(entry,web,other),session)).toBe("mismatch");
    writeFileSync(entry,"server build 2");
    expect(desktopSessionStatus(desktopIdentity(entry,web,data),session)).toBe("mismatch");
    writeFileSync(entry,"server build 1");
    writeFileSync(join(web,"index.html"),"web build 2");
    expect(desktopSessionStatus(desktopIdentity(entry,web,data),session)).toBe("mismatch");
    expect(JSON.stringify(running)).not.toContain(dir);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
