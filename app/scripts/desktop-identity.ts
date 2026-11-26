import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export const DESKTOP_VERSION = "0.6.4";
type Identity = { version: string; build: string; workspace: string };

export function desktopIdentity(entry: string, web: string, data: string): Identity {
  const workspace = realpathSync(data);
  if (!statSync(workspace).isDirectory()) throw new Error("Workspace must be a folder");
  const hash = createHash("sha256");
  // The esbuild entry points to content-hashed server chunks; Vite index points
  // to the hashed web entry. Capture these once, not on each session response.
  for (const file of [entry, join(web,"index.html")]) {
    const bytes = readFileSync(file);
    hash.update(String(bytes.length)+":").update(bytes);
  }
  return {
    version: DESKTOP_VERSION,
    build: hash.digest("hex"),
    workspace: createHash("sha256").update(process.platform==="win32"?workspace.toLowerCase():workspace).digest("hex"),
  };
}

export function desktopSessionStatus(expected: Identity, session: unknown): "match"|"mismatch"|"occupied" {
  const state = session as { app?:unknown; ok?:unknown; local?:unknown; desktop?:Partial<Identity> } | null;
  if (!state || state.app!=="tesseract" || state.ok!==true || state.local!==true) return "occupied";
  return state.desktop?.version===expected.version && state.desktop?.build===expected.build && state.desktop?.workspace===expected.workspace
    ? "match" : "mismatch";
}

async function probe(expected: Identity, port: number) {
  let response: Response;
  try {
    response=await fetch(`http://127.0.0.1:${port}/api/session`,{redirect:"error",signal:AbortSignal.timeout(700)});
  } catch(error) {
    return (error as Error & {cause?:{code?:string}}).cause?.code==="ECONNREFUSED" ? "free" : "occupied";
  }
  if(!response.ok)return "occupied";
  try {return desktopSessionStatus(expected,await response.json());} catch {return "occupied";}
}

// Only the launcher invokes this entry point directly. The server imports the helper.
if (basename(process.argv[1]??"")==="desktop-identity.ts") {
  try {
    const [entry,web,data,portArg,command]=process.argv.slice(2);
    const port=Number(portArg);
    if(!entry||!web||!data||!Number.isInteger(port)||port<1||port>65535)throw new Error("Invalid launcher arguments");
    const expected=desktopIdentity(entry,web,data);
    let result=await probe(expected,port);
    if(command==="wait"){
      const end=Date.now()+10_000;
      while(result==="free"&&Date.now()<end){await sleep(200);result=await probe(expected,port);}
    }
    console.log(result);
  } catch {
    console.error("Could not check the desktop build or workspace.");
    process.exitCode=1;
  }
}
