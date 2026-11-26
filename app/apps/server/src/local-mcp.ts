import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Store } from "@tesseract/core";
import { startLocalHttp } from "@tesseract/mcp/local-http";
import { desktopTunnelVault } from "./tunnel-vault.ts";

type Mode = "header" | "link";
export type SavedLocalMcpLink = { token:string; port:number };
type Persistence = { load():SavedLocalMcpLink|null; save(value:SavedLocalMcpLink):void; remove():void };

export function windowsLocalMcpPersistence(dataDir:string, dir=join(homedir(),".tesseract")):Persistence|undefined {
  if(process.platform!=="win32") return undefined;
  // Scope the saved capability to this Windows user and this exact workspace.
  const slot=createHash("sha256").update(realpathSync(dataDir).toLowerCase()).digest("hex");
  const vault=desktopTunnelVault(dir,"local-mcp");
  const path=join(dir,`local-mcp-key-${slot}.dpapi`);
  return {
    load(){
      if(!existsSync(path))return null;
      const raw=vault.read(slot);
      if(!raw)throw new Error("Saved link is unreadable");
      const value=JSON.parse(raw) as SavedLocalMcpLink;
      if(!value || !/^[A-Za-z0-9_-]{43}$/.test(value.token) || typeof value.token!=="string"
        || !Number.isInteger(value.port) || value.port<1 || value.port>65535) throw new Error("Saved link is invalid");
      return {token:value.token,port:value.port};
    },
    save(value){
      mkdirSync(dir,{recursive:true,mode:0o700});
      vault.save(slot,JSON.stringify(value));
    },
    remove(){vault.remove(slot);},
  };
}

export function localMcpControl(store:Store,persistence?:Persistence) {
  let active: (Awaited<ReturnType<typeof startLocalHttp>> & {token:string;mode:Mode}) | undefined;
  let remembered=false;
  let restoreError:string|undefined;
  let queue:Promise<unknown>=Promise.resolve();
  function run<T>(action:()=>Promise<T>) {
    const result=queue.then(action);
    queue=result.catch(()=>{});
    return result;
  }
  const settings=()=>persistence?{canRemember:true as const,remembered,...(restoreError?{restoreError}:{})}:{};
  const state=()=>({...(!active ? {on:false as const} : active.mode === "link"
    ? {on:true as const,mode:"link" as const}
    : {on:true as const,url:active.url}),...settings()});
  const reveal=()=>!active?null:active.mode==="link"
    ? {on:true as const,mode:"link" as const,url:active.url,...settings()}
    : {on:true as const,url:active.url,token:active.token,...settings()};
  async function launch(mode:Mode, record?:SavedLocalMcpLink){
    const token=record?.token??randomBytes(32).toString("base64url");
    active={...await startLocalHttp(store,{token,port:record?.port,authMode:mode}),token,mode};
  }
  async function restoreSaved(){
    if(!persistence||active)return;
    try{
      const record=persistence.load();
      remembered=!!record;
      if(record)await launch("link",record);
      restoreError=undefined;
    } catch(error) {
      remembered=true;
      restoreError=(error as NodeJS.ErrnoException)?.code==="EADDRINUSE"
        ? "The saved Local MCP port is busy. Free it and retry, or forget the saved link."
        : "Could not restore the saved Local MCP link. Retry or forget it.";
    }
  }
  async function closeActive(){
    if(active){await active.close();active=undefined;}
  }
  const start=(mode:Mode="header")=>run(async()=>{
    if(restoreError||active&&active.mode!==mode)return null;
    if(!active)await launch(mode);
    return reveal();
  });
  const remember=()=>run(async()=>{
    if(!persistence||active?.mode==="header")return null;
    if(remembered){
      if(!active)await restoreSaved();
      return reveal()??state();
    }
    const newlyStarted=!active;
    if(newlyStarted)await launch("link");
    try {
      persistence.save({token:active!.token,port:Number(new URL(active!.url).port)});
    } catch(error) {
      if(newlyStarted) await closeActive();
      throw error;
    }
    remembered=true;
    return reveal();
  });
  const stop=()=>run(async()=>{
    if(remembered)persistence?.remove();
    remembered=false;
    restoreError=undefined;
    await closeActive();
    return {on:false as const,...settings()};
  });
  return {state,start,remember,stop,restore:()=>run(restoreSaved),close:()=>run(closeActive)};
}
export type LocalMcpControl = ReturnType<typeof localMcpControl>;
