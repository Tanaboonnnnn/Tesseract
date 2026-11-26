import { lessonLabels } from "../../lib/lesson-language.ts";
import { useEffect, useRef, useState } from "react";
import type { Scene } from "@tesseract/core";

type Entity=Scene["entities"][number] & {opacity:number;z:number};
type Vec=[number,number,number];
type Camera={yaw:number;pitch:number;zoom:number};
type Stage="upright"|"tabletop";
const worldPoint=(x:number,y:number,z:number,stage:Stage):Vec=>stage==="tabletop"
  ? [(x-50)/50,(z-50)/50,(y-50)/50] : [(x-50)/50,(50-y)/50,(z-50)/50];
type Target={id:string;position:Vec;radius:number;color:Vec};
const upright={yaw:.48,pitch:.28,zoom:1};
const tabletop={yaw:.18,pitch:.84,zoom:1.07};
const colors:Record<NonNullable<Entity["tone"]>,Vec>={neutral:[.50,.63,.73],primary:[.48,.83,.92],secondary:[.52,.78,.67],caution:[.86,.68,.49]};
const minus=(a:Vec,b:Vec):Vec=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a:Vec,b:Vec):Vec=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=(a:Vec):Vec=>{const size=Math.hypot(...a)||1;return [a[0]/size,a[1]/size,a[2]/size];};
const dot=(a:Vec,b:Vec)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function basis({yaw:y,pitch:p}:Camera):[Vec,Vec,Vec] {
  return [[Math.cos(y),0,-Math.sin(y)],[-Math.sin(y)*Math.sin(p),Math.cos(p),-Math.cos(y)*Math.sin(p)],[Math.sin(y)*Math.cos(p),Math.sin(p),Math.cos(y)*Math.cos(p)]];
}
function shader(gl:WebGLRenderingContext,type:number,code:string) {
  const s=gl.createShader(type);
  if(!s) throw Error("Shader unavailable");
  gl.shaderSource(s,code);
  gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){gl.deleteShader(s);throw Error("Shader unavailable");}
  return s;
}
function geometry(kind:Entity["kind"]) {
  // Unit geometry; interleaved position then normal. Educational shapes, not physical simulation.
  const out:number[]=[];
  const point=(i:number,j:number):Vec=> {
    const p=Math.PI*i/8, q=2*Math.PI*j/12;
    return [Math.sin(p)*Math.cos(q),Math.cos(p),Math.sin(p)*Math.sin(q)];
  };
  if(kind==="box"){
    const coords=[[-1,-1],[1,-1],[1,1],[-1,1]];
    for(let axis=0;axis<3;axis++) for(const sign of [-1,1]){
      const n:Vec=[0,0,0];n[axis]=sign;
      for(const i of [0,1,2,0,2,3]){
        const v:Vec=[0,0,0];v[axis]=sign;v[(axis+1)%3]=coords[i]![0]!;v[(axis+2)%3]=coords[i]![1]!;
        out.push(...v,...n);
      }
    }
  } else {
    for(let i=0;i<8;i++) for(let j=0;j<12;j++){
      const a=point(i,j),b=point(i+1,j),c=point(i+1,j+1),d=point(i,j+1);
      for(const v of [a,b,c,a,c,d]) out.push(...v,...v);
    }
  }
  return new Float32Array(out);
}
function tube(points:NonNullable<Entity["points"]>,stage:Stage) {
  const world=points.map(([x,y,z=50])=>worldPoint(x,y,z,stage));
  const radial=(u:Vec,v:Vec,j:number):Vec=>{
    const a=j*Math.PI/3,c=Math.cos(a),s=Math.sin(a);
    return [u[0]*c+v[0]*s,u[1]*c+v[1]*s,u[2]*c+v[2]*s];
  };
  const out:number[]=[];
  const emit=(pt:Vec,n:Vec)=>out.push(pt[0]+n[0]*.014,pt[1]+n[1]*.014,pt[2]+n[2]*.014,...n);
  for(let i=1;i<world.length;i++){
    const a=world[i-1]!,b=world[i]!,d=minus(b,a);
    if(Math.hypot(...d)<.00001)continue;
    const axis=norm(d),u=norm(cross(axis,Math.abs(axis[2])<.9?[0,0,1]:[0,1,0])),v=cross(axis,u);
    for(let j=0;j<6;j++){
      const n=radial(u,v,j),m=radial(u,v,j+1);
      emit(a,n);emit(b,n);emit(b,m);emit(a,n);emit(b,m);emit(a,m);
    }
  }
  return new Float32Array(out);
}

function createRenderer(canvas:HTMLCanvasElement,stage:Stage) {
  const gl=canvas.getContext("webgl",{alpha:true,depth:true,antialias:true});
  if(!gl) throw Error("WebGL unavailable");
  const v=shader(gl,gl.VERTEX_SHADER,`attribute vec3 p,n; uniform vec3 center,right,up,view,scale; uniform vec2 fit; varying vec3 normal;
  void main(){vec3 q=p*scale+center;gl_Position=vec4(dot(q,right)*fit.x,dot(q,up)*fit.y,-dot(q,view)*.3,1.0);normal=n;}`);
  let f:WebGLShader;
  try { f=shader(gl,gl.FRAGMENT_SHADER,`precision mediump float; varying vec3 normal; uniform vec3 tint;
  void main(){float d=max(0.0,dot(normalize(normal),normalize(vec3(-.38,.83,.48))));gl_FragColor=vec4(tint*(.49+.51*d),1.0);}`); }
  catch(e){gl.deleteShader(v);throw e;}
  const program=gl.createProgram();
  if(!program){gl.deleteShader(v);gl.deleteShader(f);throw Error("Program unavailable");}
  gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);
  gl.deleteShader(v);gl.deleteShader(f);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){gl.deleteProgram(program);throw Error("Program unavailable");}
  const uniforms=Object.fromEntries(["center","right","up","view","scale","fit","tint"].map(n=>[n,gl.getUniformLocation(program,n)]));
  const p=gl.getAttribLocation(program,"p"), n=gl.getAttribLocation(program,"n");
  const box=geometry("box"),sphere=geometry("circle");
  const buffers=[box,sphere].map(data=>{
    const handle=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,handle);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    return {handle,count:data.length/6};
  });
  // The same point list is reused by every sampled frame; upload each path once.
  const paths=new Map<NonNullable<Entity["points"]>,{handle:WebGLBuffer,count:number}>();
  const pathFor=(points:NonNullable<Entity["points"]>)=>{
    const existing=paths.get(points);if(existing)return existing;
    const handle=gl.createBuffer();if(!handle)throw Error("Path unavailable");
    const vertices=tube(points,stage);
    gl.bindBuffer(gl.ARRAY_BUFFER,handle);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
    const path={handle,count:vertices.length/6};paths.set(points,path);return path;
  };
  const scaffold=gl.createBuffer();
  const grid:number[]=[];
  if(stage==="tabletop") {
    for(let i=-5;i<=5;i++){
      const v=i*.23;
      for(const [x,z] of [[v,-1.15],[v,1.15],[-1.15,v],[1.15,v]]){
        grid.push(x!,-.035,z!,0,1,0);
      }
    }
  }
  gl.bindBuffer(gl.ARRAY_BUFFER,scaffold);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(grid),gl.STATIC_DRAW);
  gl.enable(gl.DEPTH_TEST);
  return {
    draw(targets:Target[], entities:Entity[], camera:Camera,highlighted:ReadonlySet<string>) {
      if(gl.isContextLost()) throw Error("WebGL context lost");
      const css=canvas.getBoundingClientRect();
      const ratio=Math.min(1.5,window.devicePixelRatio||1);
      const w=Math.max(1,Math.min(900,Math.round(css.width*ratio))),h=Math.max(1,Math.min(600,Math.round(css.height*ratio)));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      const [right,up,view]=basis(camera);
      const fit:[number,number]=[Math.min(1,h/w)*camera.zoom,Math.min(1,w/h)*camera.zoom];
      gl.viewport(0,0,w,h); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform3fv(uniforms.right!,right);gl.uniform3fv(uniforms.up!,up);gl.uniform3fv(uniforms.view!,view);
      gl.uniform2fv(uniforms.fit!,fit);
      if(grid.length) {
        gl.uniform3fv(uniforms.center!,[0,0,0]);gl.uniform3fv(uniforms.scale!,[1,1,1]);gl.uniform3fv(uniforms.tint!,[.175,.243,.30]);
        gl.bindBuffer(gl.ARRAY_BUFFER,scaffold);
        gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,3,gl.FLOAT,false,24,0);
        gl.enableVertexAttribArray(n);gl.vertexAttribPointer(n,3,gl.FLOAT,false,24,12);
        gl.drawArrays(gl.LINES,0,grid.length/6);
      }
      for(const e of entities) {
        if(e.kind!=="path" || e.opacity<=0 || !e.points) continue;
        const color=highlighted.has(e.id)?colors.primary:[.29,.40,.48];
        const path=pathFor(e.points);
        gl.uniform3fv(uniforms.center!,stage==="tabletop"?[e.x/50,(e.z-50)/50,e.y/50]:[e.x/50,-e.y/50,(e.z-50)/50]);gl.uniform3fv(uniforms.scale!,[1,1,1]);gl.uniform3fv(uniforms.tint!,color);
        gl.bindBuffer(gl.ARRAY_BUFFER,path.handle);
        gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,3,gl.FLOAT,false,24,0);
        gl.enableVertexAttribArray(n);gl.vertexAttribPointer(n,3,gl.FLOAT,false,24,12);
        gl.drawArrays(gl.TRIANGLES,0,path.count);
      }
      for(const t of targets){
        const e=entities.find(x=>x.id===t.id)!;
        const buffer=buffers[e.kind==="box"?0:1]!;
        const size=t.radius;
        gl.uniform3fv(uniforms.center!,t.position);gl.uniform3fv(uniforms.tint!,t.color);
        gl.uniform3fv(uniforms.scale!,[size,e.kind==="box"?(e.height??e.width??16)/100:size,e.kind==="box"?(e.depth??e.width??16)/100:size]);
        gl.bindBuffer(gl.ARRAY_BUFFER,buffer.handle);
        gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,3,gl.FLOAT,false,24,0);
        gl.enableVertexAttribArray(n);gl.vertexAttribPointer(n,3,gl.FLOAT,false,24,12);
        gl.drawArrays(gl.TRIANGLES,0,buffer.count);
        if(e.kind==="box" && e.appearance) {
          const [x,y,z]=t.position;
          const face=z+(e.depth??e.width??16)/100;
          const h=(e.height??e.width??16)/100;
          const detail=(cx:number,cy:number,cz:number,sx:number,sy:number,color:Vec)=>{
            gl.uniform3fv(uniforms.center!,[cx,cy,cz]);
            gl.uniform3fv(uniforms.scale!,[sx,sy,.004]);
            gl.uniform3fv(uniforms.tint!,color);
            gl.drawArrays(gl.TRIANGLES,0,buffer.count);
          };
          if(e.appearance==="display") {
            detail(x,y+h*.1,face,size*.78,h*.62,[.09,.18,.24]);
            detail(x,y+h*.42,face+.008,size*.55,h*.1,colors.primary);
          } else {
            for(const dy of [-h*.49,0,h*.49]){
              detail(x,y+dy,face,size*.79,h*.17,[.13,.24,.31]);
              detail(x+size*.55,y+dy,face+.008,size*.08,h*.07,colors.secondary);
            }
          }
        }
      }
    },
    dispose(){for(const b of buffers)gl.deleteBuffer(b.handle);for(const path of paths.values())gl.deleteBuffer(path.handle);paths.clear();gl.deleteBuffer(scaffold);gl.deleteProgram(program);},
  };
}

export default function SceneMesh({entities,highlighted,onSelect,onUnavailable,label,language,stage="upright"}:{entities:Entity[];highlighted:ReadonlySet<string>;onSelect:(id:string)=>void;onUnavailable:()=>void;label:string;language?:string;stage?:Stage}) {
  const labels=lessonLabels(language);
  const initial=stage==="tabletop"?tabletop:upright;
  const canvas=useRef<HTMLCanvasElement>(null);
  const renderer=useRef<ReturnType<typeof createRenderer>|null>(null);
  const [camera,setCamera]=useState(initial);
  const desired=useRef(initial), rendered=useRef(initial), animation=useRef(0), last=useRef<number|null>(null);
  const applyCamera=(value:Camera)=>{rendered.current=value;setCamera(value);};
  const update=(to:Camera)=>{
    desired.current=to;
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.hidden){
      if(animation.current)cancelAnimationFrame(animation.current);
      animation.current=0;last.current=null;applyCamera(to);return;
    }
    if(animation.current)return;
    const tick=(now:number)=>{
      animation.current=0;
      if(document.hidden){last.current=null;applyCamera(desired.current);return;}
      const a=rendered.current,b=desired.current;
      const dt=Math.min(50,last.current===null?16:now-last.current);
      last.current=now;
      const alpha=1-Math.exp(-dt/65);
      const delta=Math.abs(b.yaw-a.yaw)+Math.abs(b.pitch-a.pitch)+Math.abs(b.zoom-a.zoom);
      if(delta<.002){last.current=null;applyCamera(b);return;}
      applyCamera({yaw:a.yaw+(b.yaw-a.yaw)*alpha,pitch:a.pitch+(b.pitch-a.pitch)*alpha,zoom:a.zoom+(b.zoom-a.zoom)*alpha});
      animation.current=requestAnimationFrame(tick);
    };
    animation.current=requestAnimationFrame(tick);
  };
  useEffect(()=>()=>{if(animation.current)cancelAnimationFrame(animation.current);},[]);
  const [geometrySize,setGeometrySize]=useState(0);
  const drag=useRef<{x:number;y:number;yaw:number;pitch:number;pointer:number;moved:boolean}|null>(null);
  const targets=entities.filter(e=>e.kind!=="path" && e.opacity>0).map(e=>({
    id:e.id,position:worldPoint(e.x,e.y,e.z,stage),
    radius:(e.width??(e.kind==="point"?8:22))/100,
    color:e.kind==="box" ? (highlighted.has(e.id)?[.55,.72,.80] as Vec : [ .39,.49,.57 ] as Vec) :
      highlighted.has(e.id)?[.82,.69,.47] as Vec:colors[e.tone??"neutral"],
  }));
  useEffect(()=>{
    const el=canvas.current!;
    try{renderer.current=createRenderer(el,stage);}catch{onUnavailable();return;}
    const lost=(event:Event)=>{event.preventDefault();onUnavailable();};
    const resize=new ResizeObserver(()=>setGeometrySize(i=>i+1)); resize.observe(el);
    el.addEventListener("webglcontextlost",lost);
    return ()=>{resize.disconnect();el.removeEventListener("webglcontextlost",lost);renderer.current?.dispose();renderer.current=null;};
  },[onUnavailable,stage]);
  useEffect(()=>{
    try{renderer.current?.draw(targets,entities,camera,highlighted);}catch{onUnavailable();}
  },[targets,entities,camera,geometrySize,onUnavailable,highlighted]);
  const orbit=(yaw:number,pitch=0)=>{const c=desired.current;update({...c,yaw:c.yaw+yaw,pitch:Math.max(-1.3,Math.min(1.3,c.pitch+pitch))});};
  const zoom=(direction:number)=>{const c=desired.current;update({...c,zoom:Math.min(1.65,Math.max(.6,c.zoom+direction))});};
  const [right,up]=basis(camera);
  const unit=(n:number)=>Math.max(10,Math.min(90,n));
  const button="tess-camera-button";
  return <>
    <div className="tess-scene-canvas tess-scene-mesh-stage relative mt-2" data-projection="isometric" data-stage={stage}>
    <canvas className="block aspect-[5/3] w-full touch-none" ref={canvas} aria-label={label+" · "+labels.scene3d}
      onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,pointer:e.pointerId,yaw:rendered.current.yaw,pitch:rendered.current.pitch,moved:false};}}
      onPointerMove={e=>{const d=drag.current;if(!d||d.pointer!==e.pointerId)return; const dx=e.clientX-d.x,dy=e.clientY-d.y;if(!d.moved && Math.hypot(dx,dy)<5)return;d.moved=true;update({...desired.current,yaw:d.yaw-dx*.01,pitch:Math.min(1.3,Math.max(-1.3,d.pitch+dy*.01))});}}
      onPointerCancel={()=>{drag.current=null;}}
      onPointerUp={e=>{
        const d=drag.current;drag.current=null;if(!d||d.moved)return;
        const b=e.currentTarget.getBoundingClientRect(),[r,u,v]=basis(camera),span=Math.min(b.width,b.height)*camera.zoom/2;
        const hit=[...targets].filter(t=>Math.hypot(e.clientX-(b.x+b.width/2+dot(t.position,r)*span),e.clientY-(b.y+b.height/2-dot(t.position,u)*span))<=Math.max(10,t.radius*span))
          .sort((a,b)=>dot(b.position,v)-dot(a.position,v))[0];
        if(hit) onSelect(hit.id);
      }} />
    <div className="pointer-events-none absolute inset-0">
      {entities.filter(e=>e.kind==="box" && e.opacity>0).map(e=>{
        const target=targets.find(t=>t.id===e.id)!;
        const pos:Vec=[target.position[0],target.position[1]+.09,target.position[2]];
        const left=unit(50+50*dot(pos,right)*.6*camera.zoom);
        const top=unit(50-50*dot(pos,up)*camera.zoom-7);
        return <span key={e.id} className="tess-scene-mesh-label" data-emphasis={highlighted.has(e.id)||undefined} style={{left:left+"%",top:top+"%"}}>{e.label}</span>;
      })}
    </div>
    </div>
    <div className="tess-camera-tools">
      <button className={button} type="button" onClick={()=>orbit(-.22)} aria-label={labels.left} title={labels.left}><span aria-hidden="true">↶</span></button>
      <button className={button} type="button" onClick={()=>orbit(.22)} aria-label={labels.right} title={labels.right}><span aria-hidden="true">↷</span></button>
      <button className={button} type="button" onClick={()=>orbit(0,.22)} aria-label={labels.up} title={labels.up}><span aria-hidden="true">↑</span></button>
      <button className={button} type="button" onClick={()=>orbit(0,-.22)} aria-label={labels.down} title={labels.down}><span aria-hidden="true">↓</span></button>
      <button className={button} type="button" onClick={()=>zoom(.15)} aria-label={labels.closer} title={labels.closer}><span aria-hidden="true">+</span></button>
      <button className={button} type="button" onClick={()=>zoom(-.15)} aria-label={labels.farther} title={labels.farther}><span aria-hidden="true">−</span></button>
      <button className={button} type="button" onClick={()=>update(initial)} aria-label={labels.reset} title={labels.reset}><span aria-hidden="true">↺</span></button>
    </div>
  </>;
}
