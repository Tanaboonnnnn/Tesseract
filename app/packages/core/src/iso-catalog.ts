/** The authoring/geometry catalog. No DOM, drawing code, styles or renderer imports. */
export type Vec = [number,number,number];
export type Port = { offset: Vec; role: "in"|"out"|"terminal" };
export type Part = { size: Vec; anchors: Record<string,Port>; cutaway?: boolean };
const io = (): Record<string,Port> => ({
  in: {offset:[0,.5,.5],role:"in"}, out:{offset:[1,.5,.5],role:"out"},
});
const poles = (): Record<string,Port> => ({
  a: {offset:[0,.5,.5],role:"terminal"}, b:{offset:[1,.5,.5],role:"terminal"},
});
const rack = (size:Vec,cutaway=false):Part => ({size,anchors:io(),cutaway});
const electric = (size:Vec,cutaway=false):Part => ({size,anchors:poles(),cutaway});
type Pack = { components: Record<string,Part>; connections: readonly ("wire"|"flow")[]; directional: boolean };
export const ISO_PACKS: Readonly<Record<string,Pack>> = {
  network: { connections:["wire","flow"], directional:true, components:{
    client:{size:[2,1.5,1],anchors:{out:io().out!}}, server:rack([2,3,1.5],true),
    "load-balancer":rack([2,2,1]), database:rack([2,2,1.5]), cache:rack([2,1,1]), queue:rack([3,1,.5]),
    packet:{size:[.5,.5,.5],anchors:{}},
  }},
  physics: { connections:["wire"], directional:false, components:{
    lamp:electric([1.5,1.5,1.5]), switch:electric([2,1,.5]), fuse:electric([2,1,.5],true),
    breaker:electric([2,2,1.5],true), coil:electric([2,1,1]), motor:electric([2,2,1.5],true),
    battery:electric([2,1,1]),
  }},
};
export const getIsoPack=(name:string)=>Object.hasOwn(ISO_PACKS,name) ? ISO_PACKS[name] : undefined;
export const getIsoPart=(pack:string,name:string)=>{
  const manifest=getIsoPack(pack)?.components;
  return manifest && Object.hasOwn(manifest,name) ? manifest[name] : undefined;
};
