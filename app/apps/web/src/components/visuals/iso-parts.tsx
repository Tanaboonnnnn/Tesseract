import type { ReactNode } from "react";
import type { Vec } from "@tesseract/core/iso-catalog";
import type { IsoState } from "@tesseract/core/iso";
import { isoProject } from "@tesseract/core/iso";
import type { XY } from "./iso-motion.ts";

type Pose={at:Vec;size:Vec;state:IsoState;cutaway?:boolean};
type Draw=(p:Pose)=>ReactNode;
export const tint=(color:string)=>`var(--iso-${color})`;
const top=(state:IsoState)=>state==="fault"?"bad":state==="active"?"accent":state==="off"?"left":"top";
const poly=(pts:Vec[])=>pts.map(p=>isoProject(p).join(",")).join(" ");
const cross=([x,y,z]:Vec,w:number,d:number):Vec[]=>[[x,y,z],[x+w,y,z],[x+w,y+d,z],[x,y+d,z]];
export function block(at:Vec,size:Vec,color="top") {
  const [w,d,h]=size;
  const b=cross(at,w,d),t=cross([at[0],at[1],at[2]+h],w,d);
  return <g className="iso-edge">
    <polygon points={poly([b[3]!,b[2]!,t[2]!,t[3]!])} fill={tint("left")}/>
    <polygon points={poly([b[1]!,b[2]!,t[2]!,t[1]!])} fill={tint("right")}/>
    <polygon points={poly(t)} fill={tint(color)}/>
  </g>;
}
const line=(p:Vec[]) => <polyline className="iso-detail" points={poly(p)}/>;
const at=(p:Pose,x:number,y:number,z:number):Vec => [p.at[0]+p.size[0]*x,p.at[1]+p.size[1]*y,p.at[2]+p.size[2]*z];
const sized=(p:Pose,w:number,d:number,h:number):Vec => [p.size[0]*w,p.size[1]*d,p.size[2]*h];
function cap(p:Pose,x:number,y:number,z:number,rx:number,ry:number,h:number,c:string){
  const [sx,sy]=isoProject(at(p,x,y,z+h));
  const dh=p.size[2]*h*40;
  return <g className="iso-edge">
    <path d={`M${sx-rx} ${sy}v${dh}a${rx} ${ry} 0 0 0 ${2*rx} 0V${sy}Z`} fill={tint("left")}/>
    <ellipse cx={sx} cy={sy} rx={rx} ry={ry} fill={tint(c)}/>
  </g>;
}
function lampDot(p:Pose,x:number,y:number,z:number,r=1.8){
  const [cx,cy]=isoProject(at(p,x,y,z));
  return <circle cx={cx} cy={cy} r={r} fill={tint(p.state==="fault"?"bad":p.state==="off"?"soft":"good")} />;
}
const plain=(p:Pose)=>p.cutaway?<g data-cut-body="">
  {block(p.at,sized(p,1,1,.19))}
  {block(at(p,0,0,.19),sized(p,1,.58,.81),top(p.state))}
  {block(at(p,.62,.58,.19),sized(p,.38,.42,.81),top(p.state))}
</g>:block(p.at,p.size,top(p.state));
const slab=(p:Pose)=>block(p.at,sized(p,1,1,.2));
function terminalPair(p:Pose){
  return <>{[.08,.92].map(x=><g key={x}>{cap(p,x,.5,.57,4,2,.15,"right")}</g>)}</>;
}
function cut(p:Pose,inner:ReactNode){
  if(!p.cutaway)return null;
  const points=[at(p,.04,.6,.2),at(p,.61,.6,.2),at(p,.61,.98,.2),at(p,.04,.98,.2)];
  return <g data-cutaway-part="">
    <polygon className="iso-edge" points={poly(points)} fill={tint("left")}/>
    {[.14,.24,.34,.44,.54].map(x=><g opacity=".18" key={x}>{line([at(p,x,.65,.21),at(p,x+.05,.9,.21)])}</g>)}
    {inner}
  </g>;
}
const network:Record<string,Draw>={
  client:p=><g>{slab(p)}{block(at(p,0,0,.2),sized(p,1,.18,.8),top(p.state))}
    <polygon points={poly([at(p,.13,.19,.90),at(p,.87,.19,.90),at(p,.87,.19,.31),at(p,.13,.19,.31)])} fill={tint("right")}/>
    {[.40,.55,.70].map(y=><g key={y}>{line([at(p,.14,y,.21),at(p,.86,y,.21)])}</g>)}</g>,
  server:p=><g>{plain(p)}
    {[.25,.5,.75].map(z=><g key={z}>{line([at(p,.14,1.001,z),at(p,.7,1.001,z)])}</g>)}
    {lampDot(p,.84,1.002,.5)}
    {cut(p,line([at(p,.18,.79,.23),at(p,.56,.79,.23)]))}</g>,
  "load-balancer":p=><g>{plain(p)}
    {[.25,.75].map(y=><g key={y}>
      {line([at(p,.17,.5,1.01),at(p,.48,.5,1.01),at(p,.80,y,1.01)])}
      <polygon points={poly([at(p,.88,y,1.01),at(p,.73,y-.055,1.01),at(p,.73,y+.055,1.01)])} fill={tint("ink")}/>
    </g>)}</g>,
  database:p=><g>{[0,.29,.58].map((z,i)=><g key={z}>{cap(p,.5,.5,z,Math.min(p.size[0],p.size[1])*13,Math.min(p.size[0],p.size[1])*6.5,.25,i===2?top(p.state):"top")}</g>)}</g>,
  cache:p=><g>{plain(p)}<polygon points={poly([at(p,.55,.2,1.01),at(p,.33,.57,1.01),at(p,.51,.57,1.01),at(p,.40,.82,1.01),at(p,.72,.43,1.01),at(p,.54,.43,1.01)])} fill={tint("ink")}/></g>,
  queue:p=><g>{slab(p)}
    {[.07,.25,.43,.61,.79].map(x=><g key={x}>{block(at(p,x,.2,.2),sized(p,.14,.6,.7),top(p.state))}</g>)}</g>,
  packet:p=>block(p.at,p.size,top(p.state)),
};
const physics:Record<string,Draw>={
  lamp:p=><g>{slab(p)}
    {cap(p,.5,.5,.15,Math.min(p.size[0],p.size[1])*8,Math.min(p.size[0],p.size[1])*4,.23,"right")}
    {cap(p,.5,.5,.38,Math.min(p.size[0],p.size[1])*12,Math.min(p.size[0],p.size[1])*5,.5,top(p.state))}</g>,
  switch:p=><g>{block(p.at,sized(p,1,1,.48),top(p.state))}{terminalPair(p)}
    {line([at(p,.18,.5,.76),at(p,.8,p.state==="off"?.21:.5,.82)])}</g>,
  fuse:p=>p.cutaway?<g>{plain(p)}{cut(p,line([at(p,.16,.77,.24),at(p,.51,.77,.24)]))}</g>:<g>{slab(p)}
    {block(at(p,.19,.24,.2),sized(p,.62,.52,.8),top(p.state))}
    {line([at(p,.07,.5,.25),at(p,.19,.5,.25)])}{line([at(p,.81,.5,.25),at(p,.93,.5,.25)])}
    {cut(p,line([at(p,.16,.77,.24),at(p,.51,.77,.24)]))}</g>,
  breaker:p=><g>{plain(p)}{block(at(p,.29,.30,.89),sized(p,.42,.38,.11),p.state==="off"?"right":"left")}
    {line([at(p,.4,.45,1.009),at(p,.6,p.state==="off"?.57:.36,1.009)])}
    {cut(p,line([at(p,.16,.74,.24),at(p,.52,.86,.24)]))}</g>,
  coil:p=><g>{slab(p)}
    {[.20,.35,.50,.65,.80].map(x=><g key={x}>{cap(p,x,.5,.20,4.4,2.4,.54,top(p.state))}</g>)}</g>,
  motor:p=>p.cutaway?<g>{plain(p)}{cut(p,line([at(p,.17,.78,.24),at(p,.54,.78,.24)]))}</g>:<g>{slab(p)}
    {cap(p,.43,.50,.20,Math.min(p.size[0],p.size[1])*12,Math.min(p.size[0],p.size[1])*6,.68,top(p.state))}
    {line([at(p,.57,.51,.50),at(p,.95,.51,.50)])}
    {cut(p,line([at(p,.17,.78,.24),at(p,.54,.78,.24)]))}</g>,
  battery:p=><g>{plain(p)}
    {[.26,.74].map(x=><g key={x}>{line([at(p,x-.08,.5,1.012),at(p,x+.08,.5,1.012)])}</g>)}
    {line([at(p,.26,.36,1.012),at(p,.26,.64,1.012)])}</g>,
};
const packs:Record<string,Record<string,Draw>>={network,physics};
export function drawKeys(pack:string) {return Object.hasOwn(packs,pack)?Object.keys(packs[pack]!).sort():[];}
export function drawPart(pack:string,name:string,p:Pose) {
  const render=Object.hasOwn(packs,pack)&&Object.hasOwn(packs[pack]!,name)?packs[pack]![name]:undefined;
  return render?.(p)??null;
}
/** A screen-space token that follows the projected connection. */
export const tokenGlyph=(position:XY=[0,0])=><g transform={`translate(${position.join(" ")})`}>
  <g className="iso-edge">
    <path d="M-8 0 L0 5 L0 11 L-8 6 Z" fill={tint("left")}/>
    <path d="M0 5 L8 0 L8 6 L0 11 Z" fill={tint("right")}/>
    <path d="M-8 0 L0 -5 L8 0 L0 5 Z" fill={tint("accent")}/>
  </g>
</g>;
