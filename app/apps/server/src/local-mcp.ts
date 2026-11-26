import { randomBytes } from "node:crypto";
import type { Store } from "@tesseract/core";
import { startLocalHttp } from "@tesseract/mcp/local-http";

export function localMcpControl(store:Store) {
  let active: (Awaited<ReturnType<typeof startLocalHttp>> & {token:string}) | undefined;
  let queue:Promise<unknown>=Promise.resolve();
  function run<T>(action:()=>Promise<T>) {
    const result=queue.then(action);
    queue=result.catch(()=>{});
    return result;
  }
  const state=()=>active?{on:true as const,url:active.url}:{on:false as const};
  const start=()=>run(async()=>{
    if(!active){
      const token=randomBytes(32).toString("base64url");
      active={...await startLocalHttp(store,{token}),token};
    }
    return {on:true as const,url:active.url,token:active.token};
  });
  const stop=()=>run(async()=>{
    if(active){await active.close();active=undefined;}
    return {on:false as const};
  });
  return {state,start,stop};
}
export type LocalMcpControl = ReturnType<typeof localMcpControl>;
