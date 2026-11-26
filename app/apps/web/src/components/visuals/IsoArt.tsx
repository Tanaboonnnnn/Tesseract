import { useEffect, useMemo, useRef } from "react";
import { getIsoPart } from "@tesseract/core/iso-catalog";
import type { Vec } from "@tesseract/core/iso-catalog";
import { resolveIsoFrames } from "@tesseract/core/iso";
import type { ValidIso } from "@tesseract/core/iso";
import { block, drawKeys, drawPart, labelSurface, tokenGlyph } from "./iso-parts.tsx";
import { isoCamera } from "./iso-camera.ts";
import type { IsoCamera, IsoTurn } from "./iso-camera.ts";
import { routeMotion } from "./iso-motion.ts";
import type { XY } from "./iso-motion.ts";
import "./iso-tokens.css";
import "./iso-scene.css";
export { drawKeys };

const xy=(p:XY)=>p.join(",");
const plot=(pts:Vec[],camera:IsoCamera)=>pts.map(p=>xy(camera.project(p))).join(" ");
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
function stageLayout(checked:ValidIso,camera:IsoCamera) {
  const {geometry:{routes},value:{data:{pack,objects}}}=checked;
  const {project}=camera;
  const bounds:Rect=[Infinity,Infinity,-Infinity,-Infinity];
  const include=(x:number,y:number,margin:number)=>{
    bounds[0]=Math.min(bounds[0],x-margin);bounds[1]=Math.min(bounds[1],y-margin);
    bounds[2]=Math.max(bounds[2],x+margin);bounds[3]=Math.max(bounds[3],y+margin);
  };
  for(const points of Object.values(routes))for(const p of points) include(...project(p),24);
  const ground=stageGround(checked);
  for(const x of [ground.left,ground.left+ground.side])for(const y of [ground.top,ground.top+ground.side]){
    const [px,py]=project([x,y,-.2]);
    bounds[0]=Math.min(bounds[0],px-3);bounds[1]=Math.min(bounds[1],py-9);
    bounds[2]=Math.max(bounds[2],px+3);bounds[3]=Math.max(bounds[3],py+3);
  }
  const solids=objects.map(o=>{
    const [w,d,h]=dimensions(o,pack);
    const points=[0,w].flatMap(x=>[0,d].flatMap(y=>[0,h].map(z=>project([o.at[0]+x,o.at[1]+y,o.at[2]+z]))));
    for(const point of points)include(...point,8);
    const box:Rect=[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
    return {id:o.id,box};
  });
  const blocked:Rect[]=solids.map(o=>o.box);
  const area=(a:Rect,b:Rect)=>Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*
    Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
  let score=solids.reduce((sum,a,i)=>sum+solids.slice(0,i).reduce((n,b)=>n+area(a.box,b.box)/20,0),0);
  const blockedSamples=(from:XY,to:XY,obstacles:Rect[])=>{
    let hits=0;
    for(let i=1;i<12;i++){
      const x=from[0]+(to[0]-from[0])*i/12,y=from[1]+(to[1]-from[1])*i/12;
      if(obstacles.some(b=>intersects(b,[x-2,y-2,x+2,y+2])))hits++;
    }
    return hits;
  };
  for(const c of checked.value.data.connections){
    const path=routes[c.id]!.map(project), other=solids.filter(s=>s.id!==c.from.object&&s.id!==c.to.object).map(s=>s.box);
    for(let i=1;i<path.length;i++)score+=blockedSamples(path[i-1]!,path[i]!,other)*7;
  }
  const labels=new Map<string,{anchor:XY;pos:XY}>();
  for(const o of objects.slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)){
    if(!o.label)continue;
    const [w,d,h]=dimensions(o,pack);
    const [ox,oy,oz]=o.at;
    const [u0,u1,v0,v1,z]=labelSurface(pack,o.component);
    const top=(u:number,v:number)=>project([ox+w*u,oy+d*v,oz+h*z]);
    const anchors=[top((u0+u1)/2,(v0+v1)/2),top(u0,v0),top(u0,v1),top(u1,v0),top(u1,v1)];
    const [x,y]=anchors[0]!;
    const half=Array.from(o.label).length*5.6+6;
    const rect=([px,py]:XY):Rect=>[px-half,py-19,px+half,py+17];
    const own=solids.find(s=>s.id===o.id)!.box;
    const obstacles=blocked.filter(b=>b!==own);
    const candidates:XY[]=[[x,own[1]-20],[own[0]-half-12,y-2],[own[2]+half+12,y-2],
      [own[0]-half-12,own[1]-11],[own[2]+half+12,own[1]-11],
      [own[0]-half-12,own[3]-3],[own[2]+half+12,own[3]-3],
      [x,own[3]+26],[x-42,own[1]-27],[x+42,own[1]-27]];
    for(let offset=55;offset<=145;offset+=15)candidates.push([x,y-offset],[x-offset,y-15],[x+offset,y-15]);
    candidates.push([x,bounds[1]-29]);
    let best={pos:candidates.at(-1)!,anchor:anchors[0]!,cost:Infinity};
    for(const pos of candidates){
      if(blocked.some(b=>intersects(b,rect(pos))))continue;
      for(const anchor of anchors){
        const end:XY=[pos[0],pos[1]+4];
        const distance=Math.hypot(anchor[0]-end[0],anchor[1]-end[1]);
        const cost=distance+blockedSamples(anchor,end,obstacles)*20+(pos[1]>y?3:0);
        if(cost<best.cost)best={pos,anchor,cost};
      }
    }
    const box=rect(best.pos);
    labels.set(o.id,{anchor:best.anchor,pos:best.pos});
    blocked.push(box);
    score+=Number.isFinite(best.cost)?best.cost*.52:10_000;
    bounds[0]=Math.min(bounds[0],box[0]);bounds[1]=Math.min(bounds[1],box[1]);
    bounds[2]=Math.max(bounds[2],box[2]);bounds[3]=Math.max(bounds[3],box[3]);
  }
  const w=bounds[2]-bounds[0],h=bounds[3]-bounds[1];
  const padX=Math.max(12,w/8),padY=Math.max(12,h/8);
  return {labels,ground,score, center:[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2] as XY, width:w+padX*2,height:h+padY*2};
}
/** Scope camera and composition to this renderer, not the saved data or MCP schema. */
export function isoViewPlan(checked:ValidIso){
  const turns=[0,1,2,3] as const;
  const options=turns.map(turn=>{
    const camera=isoCamera(turn);
    return {turn,camera,layout:stageLayout(checked,camera)};
  });
  const width=Math.max(...options.map(o=>o.layout.width));
  const height=Math.max(...options.map(o=>o.layout.height));
  const home=options.reduce((best,o)=>o.layout.score<best.layout.score?o:best);
  return {home:home.turn,views:options.map(o=>{
    const [x,y]=o.layout.center;
    return {...o,viewBox:[x-width/2,y-height/2,width,height].join(" ")};
  })};
}
type ViewPlan=ReturnType<typeof isoViewPlan>;
function Grid({ground,camera}:{ground:Ground;camera:IsoCamera}){
  const {left,top,side}=ground;
  return <g aria-hidden="true" data-iso-ground={side}>
    <g className="iso-ground">{block([left,top,-.2],[side,side,.2],"top",camera)}</g>
    <g className="iso-grid">
      {Array.from({length:side-1},(_,i)=>i+1).map(i=><g key={i}>
        <polyline points={plot([[left+i,top,.001],[left+i,top+side,.001]],camera)}/>
        <polyline points={plot([[left,top+i,.001],[left+side,top+i,.001]],camera)}/>
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
export function IsoArt({checked,step,playing:animate,turn,plan}:{checked:ValidIso;step:number;playing:boolean;turn?:IsoTurn;plan?:ViewPlan}){
  const {value,geometry}=checked;
  const {pack,objects,theme_hint}=value.data;
  const frames=useMemo(()=>resolveIsoFrames(value),[value]);
  const frame=frames[step];
  const previous=frames[step-1];
  const views=useMemo(()=>plan??isoViewPlan(checked),[checked,plan]);
  const view=views.views[turn??views.home]!;
  const {camera,layout,viewBox}=view;
  const {project}=camera;
  const routes=useMemo(()=>Object.fromEntries(Object.entries(geometry.routes).map(([k,p])=>[k,p.map(project)])),[geometry,project]);
  const byId=new Map(objects.map(o=>[o.id,o]));
  const depth=(id:string)=>{
    const o=byId.get(id)!, [w,d]=dimensions(o,pack);
    return camera.depth([o.at[0]+w/2,o.at[1]+d/2,o.at[2]]);
  };
  const painted=geometry.painted.slice().sort((a,b)=>depth(a)-depth(b));
  const visible=new Set(frame?.visible??[...objects.map(o=>o.id),...value.data.connections.map(c=>c.id)]);
  const focus=new Set(frame?.highlight??[]);
  const props=(o:Obj)=>({at:o.at,size:dimensions(o,pack),state:frame?.states[o.id]??o.state,cutaway:frame?.cutaway===o.id,camera});
  const status=(o:Obj)=>{
    const s=props(o).state;
    return s==="fault"?"Fault":s==="off"?"Off":"";
  };
  const labeled=objects.filter(o=>visible.has(o.id)&&layout.labels.has(o.id));
  const pinNumber=(id:string)=>objects.filter(o=>o.label).findIndex(o=>o.id===id)+1;
  return <figure className="iso-shell" data-iso-theme={theme_hint}>
    <svg className="iso-scene" data-iso-theme={theme_hint} data-iso-view={view.turn} viewBox={viewBox} role="img" aria-label={value.title}>
      <Grid ground={layout.ground} camera={camera}/>
      {painted.filter(id=>visible.has(id)).map(id=>{
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
      {painted.filter(id=>visible.has(id)).map(id=>{
        const o=byId.get(id)!;
        const pose=props(o);
        return <Body key={id} id={id} fault={pose.state==="fault"&&(previous?.states[id]??o.state)!=="fault"} step={step} animate={animate} dim={!!focus.size&&!focus.has(id)&&pose.state!=="fault"}>
          {drawPart(pack,o.component,pose)}
        </Body>;
      })}
      {value.data.connections.filter(c=>visible.has(c.id)&&focus.has(c.id)&&c.kind==="flow").map(c=>
        <FlowToken key={c.id} flow={c.id} points={routes[c.id]!} step={step} enabled={animate}/>)}
      {labeled.map(o=>{
        const {anchor:[x,y],pos:[tx,ty]}=layout.labels.get(o.id)!;
        return <g key={o.id} className="iso-annotation" data-dim={(focus.size>0&&!focus.has(o.id)&&!status(o))||undefined}>
          <line x1={x} y1={y} x2={tx} y2={ty+4} className="iso-leader"/>
          <circle cx={x} cy={y} r="2.2" className="iso-note-dot"/>
          <text x={tx} y={ty} className="iso-label" textAnchor="middle" data-focus={focus.has(o.id)||undefined}>{o.label}</text>
          {status(o)&&<text x={tx} y={ty+11} className="iso-status" textAnchor="middle">{status(o)}</text>}
          <g className="iso-pin" data-iso-pin={pinNumber(o.id)} aria-hidden="true">
            <circle cx={tx} cy={ty-6} r="20"/>
            <text x={tx} y={ty-5} textAnchor="middle" dominantBaseline="central">{pinNumber(o.id)}</text>
          </g>
        </g>;
      })}
    </svg>
    {labeled.length>0&&<figcaption className="iso-key">
      <ul aria-label="Illustration key">
        {labeled.map(o=><li key={o.id}><span className="iso-key-pin" aria-hidden="true">{pinNumber(o.id)}</span>
          <span>{o.label}</span>{status(o)&&<span className="iso-key-status">{status(o)}</span>}</li>)}
      </ul>
    </figcaption>}
  </figure>;
}
