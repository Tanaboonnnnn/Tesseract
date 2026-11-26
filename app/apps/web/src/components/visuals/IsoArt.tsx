import { useEffect, useMemo, useRef } from "react";
import { getIsoPart } from "@tesseract/core/iso-catalog";
import type { Vec } from "@tesseract/core/iso-catalog";
import { isoProject, resolveIsoFrames } from "@tesseract/core/iso";
import type { ValidIso } from "@tesseract/core/iso";
import { block, drawKeys, drawPart, tokenGlyph } from "./iso-parts.tsx";
import { routeMotion } from "./iso-motion.ts";
import type { XY } from "./iso-motion.ts";
import "./iso-tokens.css";
import "./iso-scene.css";
export { drawKeys };

const xy=(p:XY)=>p.join(",");
const project=(p:Vec)=>isoProject(p);
const plot=(pts:Vec[])=>pts.map(p=>xy(project(p))).join(" ");
type Obj=ValidIso["value"]["data"]["objects"][number];
type Rect=[number,number,number,number];
const intersects=(a:Rect,b:Rect)=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];
const dimensions=(o:Obj,pack:string)=>o.size??getIsoPart(pack,o.component)!.size;
type Ground={left:number;top:number;side:number};
function stageGround(checked:ValidIso):Ground {
  const {value:{data:{objects,pack}},geometry:{routes}}=checked;
  const axis=(i:0|1)=>objects.flatMap(o=>[o.at[i],o.at[i]+dimensions(o,pack)[i]])
    .concat(Object.values(routes).flatMap(points=>points.map(p=>p[i])));
  const x=axis(0), y=axis(1);
  const limits=(a:number[])=>[Math.min(...a),Math.max(...a)] as const;
  const [x0,x1]=limits(x),[y0,y1]=limits(y);
  const side=Math.max(4,Math.ceil(Math.max(x1-x0,y1-y0)+2));
  return {left:Math.floor(x0+x1-side)/2,top:Math.floor(y0+y1-side)/2,side};
}
function stageLayout(checked:ValidIso) {
  const {geometry:{contentBounds},value:{data:{pack,objects}}}=checked;
  const bounds:Rect=[...contentBounds];
  const ground=stageGround(checked);
  for(const x of [ground.left,ground.left+ground.side])for(const y of [ground.top,ground.top+ground.side]){
    const [px,py]=project([x,y,-.2]);
    bounds[0]=Math.min(bounds[0],px-3);bounds[1]=Math.min(bounds[1],py-9);
    bounds[2]=Math.max(bounds[2],px+3);bounds[3]=Math.max(bounds[3],py+3);
  }
  const blocked:Rect[]=objects.map(o=>{
    const [w,d,h]=dimensions(o,pack);
    const points=[0,w].flatMap(x=>[0,d].flatMap(y=>[0,h].map(z=>project([o.at[0]+x,o.at[1]+y,o.at[2]+z]))));
    return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
  });
  const labels=new Map<string,{anchor:XY;pos:XY}>();
  for(const o of objects.slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)){
    if(!o.label)continue;
    const [w,d,h]=dimensions(o,pack);
    const anchor=project([o.at[0]+w/2,o.at[1]+d/2,o.at[2]+h]);
    const half=Array.from(o.label).length*5.6+6;
    const [x,y]=anchor;
    const candidates:XY[]=[[x,y-36],[x-38-half,y-18],[x+38+half,y-18],[x,y-66],[x-61-half,y-44],[x+61+half,y-44]];
    const rect=([px,py]:XY):Rect=>[px-half,py-18,px+half,py+6];
    const pos=candidates.find(p=>blocked.every(b=>!intersects(b,rect(p))))??[x,bounds[1]-28];
    const box=rect(pos);
    labels.set(o.id,{anchor,pos});
    blocked.push(box);
    bounds[0]=Math.min(bounds[0],box[0]);bounds[1]=Math.min(bounds[1],box[1]);
    bounds[2]=Math.max(bounds[2],box[2]);bounds[3]=Math.max(bounds[3],box[3]);
  }
  const w=bounds[2]-bounds[0],h=bounds[3]-bounds[1];
  const padX=Math.max(12,w/8),padY=Math.max(12,h/8);
  return {labels,ground,viewBox:[bounds[0]-padX,bounds[1]-padY,w+padX*2,h+padY*2].join(" ")};
}
function Grid({ground}:{ground:Ground}){
  const {left,top,side}=ground;
  return <g aria-hidden="true" data-iso-ground={side}>
    <g className="iso-ground">{block([left,top,-.2],[side,side,.2])}</g>
    <g className="iso-grid">
      {Array.from({length:side-1},(_,i)=>i+1).map(i=><g key={i}>
        <polyline points={plot([[left+i,top,.001],[left+i,top+side,.001]])}/>
        <polyline points={plot([[left,top+i,.001],[left+side,top+i,.001]])}/>
      </g>)}
    </g>
  </g>;
}
function FlowToken({points,step,enabled,flow}:{points:XY[];step:number;enabled:boolean;flow:string}){
  const p=points.at(-1) || [0,0];
  const ref=useRef<SVGGElement>(null);
  useEffect(()=>{
    const node=ref.current;
    if(!node||!enabled||step<0||!node.animate||document.hidden)return;
    const frames=routeMotion(points);
    if(!frames.length)return;
    const a=node.animate(frames,{duration:950,iterations:1,easing:"linear"});
    const stop=()=>{if(document.hidden)a.cancel();};
    const observer=typeof IntersectionObserver==="undefined"?null:new IntersectionObserver(entries=>{
      if(entries[0]&&!entries[0].isIntersecting)a.cancel();
    });
    observer?.observe(node.ownerSVGElement!);
    document.addEventListener("visibilitychange",stop);
    return ()=>{a.cancel();observer?.disconnect();document.removeEventListener("visibilitychange",stop);};
  },[points,step,enabled]);
  return <g data-iso-packet={flow} ref={ref} style={{transform:`translate(${p[0]}px, ${p[1]}px)`}}>{tokenGlyph()}</g>;
}
function Body({children,fault,animate,step,id,dim}:{children:React.ReactNode;fault:boolean;animate:boolean;step:number;id:string;dim:boolean}){
  const ref=useRef<SVGGElement>(null);
  useEffect(()=>{
    const node=ref.current;
    if(!fault||!animate||step<0||!node?.animate||document.hidden)return;
    const a=node.animate([{transform:"translateX(0px)"},{transform:"translateX(4px)"},{transform:"translateX(-3px)"},{transform:"translateX(0px)"}],{duration:200,iterations:1});
    return ()=>a.cancel();
  },[fault,animate,step]);
  return <g ref={ref} className="iso-body" data-id={id} data-dim={dim||undefined}>{children}</g>;
}
export function IsoArt({checked,step,playing:animate}:{checked:ValidIso;step:number;playing:boolean}){
  const {value,geometry}=checked;
  const {pack,objects,theme_hint}=value.data;
  const frames=useMemo(()=>resolveIsoFrames(value),[value]);
  const frame=frames[step];
  const previous=frames[step-1];
  const layout=useMemo(()=>stageLayout(checked),[checked]);
  const routes=useMemo(()=>Object.fromEntries(Object.entries(geometry.routes).map(([k,p])=>[k,p.map(project)])),[geometry]);
  const byId=new Map(objects.map(o=>[o.id,o]));
  const visible=new Set(frame?.visible??[...objects.map(o=>o.id),...value.data.connections.map(c=>c.id)]);
  const focus=new Set(frame?.highlight??[]);
  const props=(o:Obj)=>({at:o.at,size:dimensions(o,pack),state:frame?.states[o.id]??o.state,cutaway:frame?.cutaway===o.id});
  const status=(o:Obj)=>{
    const s=props(o).state;
    return s==="fault"?"Fault":s==="off"?"Off":"";
  };
  return <figure className="iso-shell">
    <svg className="iso-scene" data-iso-theme={theme_hint} viewBox={layout.viewBox} role="img" aria-label={value.title}>
      <Grid ground={layout.ground}/>
      {geometry.painted.filter(id=>visible.has(id)).map(id=>{
        const o=byId.get(id)!;
        const [w,d]=dimensions(o,pack);
        const [cx,cy]=project([o.at[0]+w/2,o.at[1]+d/2,0]);
        return <ellipse key={id} className="iso-shadow" cx={cx+6} cy={cy+5} rx={(w+d)*9} ry={(w+d)*4.4}/>;
      })}
      {value.data.connections.filter(c=>visible.has(c.id)).map(c=>{
        const active=c.kind==="flow"&&focus.has(c.id);
        return <polyline key={c.id} className="iso-link" data-id={c.id} data-focused={focus.has(c.id)||undefined} data-active={active||undefined}
          points={routes[c.id]!.map(xy).join(" ")} strokeDasharray={c.kind==="flow"?"6 8":undefined}/>;
      })}
      {geometry.painted.filter(id=>visible.has(id)).map(id=>{
        const o=byId.get(id)!;
        const pose=props(o);
        return <Body key={id} id={id} fault={pose.state==="fault"&&(previous?.states[id]??o.state)!=="fault"} step={step} animate={animate} dim={!!focus.size&&!focus.has(id)&&pose.state!=="fault"}>
          {drawPart(pack,o.component,pose)}
        </Body>;
      })}
      {value.data.connections.filter(c=>visible.has(c.id)&&focus.has(c.id)&&c.kind==="flow").map(c=>
        <FlowToken key={c.id} flow={c.id} points={routes[c.id]!} step={step} enabled={animate}/>)}
      {objects.filter(o=>visible.has(o.id)&&layout.labels.has(o.id)).map(o=>{
        const {anchor:[x,y],pos:[tx,ty]}=layout.labels.get(o.id)!;
        return <g key={o.id} className="iso-annotation" data-dim={(focus.size>0&&!focus.has(o.id)&&!status(o))||undefined}>
          <line x1={x} y1={y} x2={tx} y2={ty+3} className="iso-leader"/>
          <circle cx={x} cy={y} r="2.2" className="iso-note-dot"/>
          <text x={tx} y={ty} className="iso-label" textAnchor="middle" data-focus={focus.has(o.id)||undefined}>{o.label}</text>
          {status(o)&&<text x={tx} y={ty+11} className="iso-status" textAnchor="middle">{status(o)}</text>}
        </g>;
      })}
    </svg>
  </figure>;
}
