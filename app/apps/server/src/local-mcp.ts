import { randomBytes } from "node:crypto";
import type { Store } from "@tesseract/core";
import { startLocalHttp } from "@tesseract/mcp/local-http";

type Mode = "header" | "link";

export function localMcpControl(store:Store) {
  let active: (Awaited<ReturnType<typeof startLocalHttp>> & {token:string;mode:Mode}) | undefined;
  let queue:Promise<unknown>=Promise.resolve();
  function run<T>(action:()=>Promise<T>) {
    const result=queue.then(action);
    queue=result.catch(()=>{});
    return result;
  }
  const state=()=>!active ? {on:false as const} : active.mode === "link"
    ? {on:true as const,mode:"link" as const}
    : {on:true as const,url:active.url};
  const start=(mode:Mode="header")=>run(async()=>{
    if(active && active.mode!==mode) return null;
    if(!active){
      const token=randomBytes(32).toString("base64url");
      active={...await startLocalHttp(store,{token,authMode:mode}),token,mode};
    }
    return active.mode==="link"
      ? {on:true as const,mode:"link" as const,url:active.url}
      : {on:true as const,url:active.url,token:active.token};
  });
  const stop=()=>run(async()=>{
    if(active){await active.close();active=undefined;}
    return {on:false as const};
  });
  return {state,start,stop};
}
export type LocalMcpControl = ReturnType<typeof localMcpControl>;
