import { useMemo } from "react";
import type { Scene } from "@tesseract/core";
import { sampleScene } from "@tesseract/core/pure";
import "./explainer-stage.css";

type Vec = readonly [number, number, number];
type Entity = ReturnType<typeof sampleScene>["entities"][number];
type Beat = Scene["beats"][number];
const UNIT = 40;
const iso = ([x,y,z]:Vec) => [(x-y)*UNIT*Math.sqrt(3)/2,(x+y)*UNIT/2-z*UNIT] as const;
const points = (p:readonly Vec[]) => p.map(v=>iso(v).join(",")).join(" ");
const fill = (token:string) => `var(--iso-${token})`;

function Box({at,w,d,h,top="top"}:{at:Vec;w:number;d:number;h:number;top?:string}) {
  const [x,y,z]=at;
  const a:Vec=[x,y,z], b:Vec=[x+w,y,z], c:Vec=[x+w,y+d,z], e:Vec=[x,y+d,z];
  const up=([px,py,pz]:Vec):Vec=>[px,py,pz+h];
  return <g className="iso-edge">
    <polygon points={points([e,c,up(c),up(e)])} fill={fill("left")}/>
    <polygon points={points([b,c,up(c),up(b)])} fill={fill("right")}/>
    <polygon points={points([up(a),up(b),up(c),up(e)])} fill={fill(top)}/>
  </g>;
}
const detail = (p:readonly Vec[]) => <polyline className="iso-detail" points={points(p)}/>;
function Solid({e,fault,active}:{e:Entity;fault:boolean;active:boolean}) {
  const {x,y,z}=e, w=e.width??1, d=e.depth??1, h=e.height??1;
  const top=fault?"bad":active?"accent":"top";
  if(e.kind==="point")return <Box at={[x-.25,y-.25,z]} w={.5} d={.5} h={.5} top={e.tone==="secondary"?"accent-2":"accent"}/>;
  if(e.kind==="circle"){
    const [cx,cy]=iso([x,y,z+h]), rx=w*UNIT/2, ry=rx/2;
    return <g className="iso-edge">
      <path d={`M${cx-rx} ${cy}v${h*UNIT}a${rx} ${ry} 0 0 0 ${2*rx} 0V${cy}Z`} fill={fill("left")}/>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fill(top)}/>
    </g>;
  }
  if(e.appearance==="display"){
    return <g><Box at={[x,y,z]} w={w} d={d} h={.2} top={top}/>
      <Box at={[x,y,z+.2]} w={w} d={d*.155} h={Math.max(.1,h-.2)} top={top}/>
      <polygon points={points([[x+w*.075,y+d*.16,z+h*.3],[x+w*.925,y+d*.16,z+h*.3],[x+w*.925,y+d*.16,z+h*.883],[x+w*.075,y+d*.16,z+h*.883]])} fill={fill("right")}/>
      {[.415,.565,.72].map(v=><g key={v}>{detail([[x+w*.1,y+d*v,z+.21],[x+w*.9,y+d*v,z+.21]])}</g>)}
    </g>;
  }
  if(e.appearance==="splitter"){
    const ze=z+h+.01;
    return <g><Box at={[x,y,z]} w={w} d={d} h={h} top={top}/>
      {[.26,.74].map(v=><g key={v}>{detail([[x+w*.21,y+d*.5,ze],[x+w*.5,y+d*.5,ze],[x+w*.8,y+d*v,ze]])}
        <polygon points={points([[x+w*.855,y+d*v,ze],[x+w*.74,y+d*v-d*.05,ze],[x+w*.74,y+d*v+d*.05,ze]])} fill={fill("ink")}/>
      </g>)}
    </g>;
  }
  return <g><Box at={[x,y,z]} w={w} d={d} h={h} top={top}/>
    {e.appearance==="equipment-rack"&&[.208,.458,.708].map((row,i)=>{
      const [cx,cy]=iso([x+w*.83,y+d,z+h*row]);
      return <g key={row}>{detail([[x+w*.14,y+d,z+h*row],[x+w*.66,y+d,z+h*row]])}
        {i===1&&<circle cx={cx} cy={cy} r={1.35} fill={fill(fault?"bad":"good")}/>}
      </g>;
    })}
  </g>;
}
const projectWire=(e:Entity)=>e.points?.map(p=>[p[0]+e.x,p[1]+e.y,(p[2]??0)+e.z] as const)??[];
function Anchor({e}:{e:Entity}) {
  const at:Vec=e.kind==="circle"?[e.x,e.y,e.z+(e.height??1)]:[e.x+(e.width??1)/2,e.y+(e.depth??1)/2,e.z+(e.height??1)];
  const [x,y]=iso(at);
  const [dx,dy]=e.label_offset??[0,-34];
  return <g>
    <path d={`M${x},${y} L${x+dx},${y+dy}`} stroke={fill("ink-soft")} fill="none"/>
    <circle cx={x} cy={y} r={2.2} fill={fill("ink")}/>
    <text x={x+dx} y={y+dy+(dy<0?-5:13)} className="iso-label" textAnchor="middle">{e.label}</text>
  </g>;
}
function Shadow({e}:{e:Entity}){
  const w=e.width??1, d=e.depth??1;
  const [cx,cy]=iso(e.kind==="circle"?[e.x,e.y,0]:[e.x+w/2,e.y+d/2,0]);
  return <ellipse className="iso-shadow" cx={cx+6} cy={cy+5} rx={(w+d)*UNIT*.24} ry={(w+d)*UNIT*.116} fill={fill("ink")}/>;
}
function Grid({maxX,maxY}:{maxX:number;maxY:number}){
  const limitX=Math.ceil(maxX)+1,limitY=Math.ceil(maxY)+1;
  const skewLeft=Math.max(3,Math.round(limitY*.46)),skewRight=Math.max(3,Math.round(limitX*.41));
  return <g fill="none" stroke={fill("ink-soft")} opacity=".13" aria-hidden="true">
    {Array.from({length:limitX+1},(_,x)=>{
      const lo=Math.max(0,x-skewRight),hi=Math.min(limitY,x+skewLeft);
      return lo<hi&&<polyline key={"x"+x} points={points([[x,lo,0],[x,hi,0]])}/>;
    })}
    {Array.from({length:limitY+1},(_,y)=>{
      const lo=Math.max(0,y-skewLeft),hi=Math.min(limitX,y+skewRight);
      return lo<hi&&<polyline key={"y"+y} points={points([[lo,y,0],[hi,y,0]])}/>;
    })}
  </g>;
}

export function ExplainerStage({scene,entities,beat,time,reduced,panel}:{scene:Scene;entities:Entity[];beat:Beat;time:number;reduced:boolean;panel:string}) {
  const {viewBox,maxX,maxY}=useMemo(()=>{
    // Include all authored positions in a fixed viewBox; camera must not jump as objects move.
    const xs:number[]=[], ys:number[]=[];
    let maxX=5,maxY=5;
    const push=(p:Vec,dx=0,dy=0,pad=0)=>{
      const [x,y]=iso(p);xs.push(x+dx-pad,x+dx+pad);ys.push(y+dy);
      maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);
    };
    const times=[0,scene.duration_ms,...(scene.tracks??[]).flatMap(t=>t.frames.map(f=>f.at_ms))];
    const snapshots=times.map(t=>sampleScene(scene,t).entities.filter(e=>e.panel===panel));
    // Manual sliders can move objects farther than timeline keys.
    for(const c of scene.controls??[]) for(const value of [c.min,c.max])
      snapshots.push(sampleScene(scene,0,{[c.id]:value}).entities.filter(e=>e.panel===panel));
    for(const es of snapshots)for(const e of es){
      if(e.kind==="path"){for(const p of projectWire(e))push(p);continue;}
      const w=e.width??1,d=e.depth??1,h=e.height??1;
      const circle=e.kind==="circle";
      const x=e.x-(circle?w/2:0),y=e.y-(circle?w/2:0);
      for(const dx of [0,w])for(const dy of [0,circle?w:d])for(const dz of [0,h])push([x+dx,y+dy,e.z+dz]);
      if(e.kind!=="point"){
        const [dx,dy]=e.label_offset??[0,-34];
        push(circle?[e.x,e.y,e.z+h]:[x+w/2,y+d/2,e.z+h],dx,dy,Math.min(140,11*Array.from(e.label).length));
      }
    }
    const [loX,hiX,loY,hiY]=[Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)];
    if(!xs.length)return {viewBox:"0 0 320 200",maxX,maxY};
    const mx=Math.max(22,(hiX-loX)*.125),my=Math.max(30,(hiY-loY)*.125);
    return {viewBox:[loX-mx,loY-my,hiX-loX+2*mx,hiY-loY+2*my].join(" "),maxX,maxY};
  },[scene,panel]);
  const visible=entities.filter(e=>e.panel===panel&&e.opacity>0);
  const bodies=visible.filter(e=>e.kind==="box"||e.kind==="circle").sort((a,b)=>
    (a.x+a.y+((a.width??1)+(a.depth??1))/2)-(b.x+b.y+((b.width??1)+(b.depth??1))/2)||a.z-b.z);
  const dt=Math.max(0,time-beat.at_ms);
  const shake=!reduced && dt<200 && scene.beats[scene.beats.indexOf(beat)-1]?.fault!==beat.fault ? Math.sin(dt/200*4*Math.PI)*(1-dt/200)*4 : 0;
  return <svg className="tess-iso-stage" viewBox={viewBox} role="img" aria-label={scene.panels.find(p=>p.id===panel)?.label} data-iso-stage>
    <Grid maxX={maxX} maxY={maxY}/>
    {bodies.map(e=><Shadow key={e.id} e={e}/>)}
    {visible.filter(e=>e.kind==="path").map(e=><g key={e.id} data-iso-route={e.id} data-active={beat.focus?.includes(e.id)||undefined} opacity={e.opacity/100}>
      <polyline className="iso-wire" points={points(projectWire(e))}/>
      {beat.focus?.includes(e.id)&&<polyline className="iso-wire iso-wire-active" points={points(projectWire(e))} strokeDasharray="6 8" strokeDashoffset={reduced?0:-Math.min(dt,950)*.22}/>}
    </g>)}
    {bodies.map(e=><g key={e.id} data-iso-entity={e.id} data-fault={beat.fault===e.id||undefined}
      opacity={e.opacity/100} transform={beat.fault===e.id&&shake?`translate(${shake},0)`:undefined}>
      <Solid e={e} fault={beat.fault===e.id} active={beat.focus?.includes(e.id)??false}/>
    </g>)}
    {visible.filter(e=>e.kind==="point").map(e=><g key={e.id} data-iso-packet={e.id} data-position={iso([e.x,e.y,e.z]).join(",")} opacity={e.opacity/100}>
      <Solid e={e} fault={false} active={true}/>
    </g>)}
    {bodies.map(e=><Anchor key={e.id} e={e}/>)}
  </svg>;
}
