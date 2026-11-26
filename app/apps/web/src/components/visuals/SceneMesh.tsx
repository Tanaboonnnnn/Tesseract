import { useEffect, useRef, useState } from "react";
import type { Scene } from "@tesseract/core";

type Entity=Scene["entities"][number] & {opacity:number;z:number};
type Vec=[number,number,number];
type Camera={yaw:number;pitch:number;zoom:number};
type Target={id:string;position:Vec;radius:number;color:Vec};
const initial={yaw:0.6,pitch:0.3,zoom:1};
const colors:Record<NonNullable<Entity["tone"]>,Vec>={neutral:[.46,.56,.66],primary:[.23,.57,.85],secondary:[.2,.68,.57],caution:[.85,.53,.22]};
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
function createRenderer(canvas:HTMLCanvasElement) {
  const gl=canvas.getContext("webgl",{alpha:true,depth:true,antialias:true});
  if(!gl) throw Error("WebGL unavailable");
  const v=shader(gl,gl.VERTEX_SHADER,`attribute vec3 p,n; uniform vec3 center,right,up,view,scale; uniform vec2 fit; varying vec3 normal;
  void main(){vec3 q=p*scale+center;gl_Position=vec4(dot(q,right)*fit.x,dot(q,up)*fit.y,-dot(q,view)*.3,1.0);normal=n;}`);
  let f:WebGLShader;
  try { f=shader(gl,gl.FRAGMENT_SHADER,`precision mediump float; varying vec3 normal; uniform vec3 tint;
  void main(){float d=max(0.0,dot(normalize(normal),normalize(vec3(-.35,.7,.65))));gl_FragColor=vec4(tint*(.58+.42*d),1.0);}`); }
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
  gl.enable(gl.DEPTH_TEST);
  return {
    draw(targets:Target[], entities:Entity[], camera:Camera) {
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
      }
    },
    dispose(){for(const b of buffers)gl.deleteBuffer(b.handle);gl.deleteProgram(program);},
  };
}

export default function SceneMesh({entities,highlighted,onSelect,onUnavailable,label}:{entities:Entity[];highlighted:ReadonlySet<string>;onSelect:(id:string)=>void;onUnavailable:()=>void;label:string}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const renderer=useRef<ReturnType<typeof createRenderer>|null>(null);
  const [camera,setCamera]=useState(initial);
  const [geometrySize,setGeometrySize]=useState(0);
  const drag=useRef<{x:number;y:number;yaw:number;pitch:number;pointer:number;moved:boolean}|null>(null);
  const targets=entities.filter(e=>e.opacity>0).map(e=>({
    id:e.id,position:[(e.x-50)/50,(50-e.y)/50,(e.z-50)/50] as Vec,
    radius:(e.width??(e.kind==="point"?8:22))/100,
    color:highlighted.has(e.id)?[.98,.66,.24] as Vec:colors[e.tone??"neutral"],
  }));
  useEffect(()=>{
    const el=canvas.current!;
    try{renderer.current=createRenderer(el);}catch{onUnavailable();return;}
    const lost=(event:Event)=>{event.preventDefault();onUnavailable();};
    const resize=new ResizeObserver(()=>setGeometrySize(i=>i+1)); resize.observe(el);
    el.addEventListener("webglcontextlost",lost);
    return ()=>{resize.disconnect();el.removeEventListener("webglcontextlost",lost);renderer.current?.dispose();renderer.current=null;};
  },[onUnavailable]);
  useEffect(()=>{
    try{renderer.current?.draw(targets,entities,camera);}catch{onUnavailable();}
  },[targets,entities,camera,geometrySize,onUnavailable]);
  const orbit=(yaw:number,pitch=0)=>setCamera(c=>({...c,yaw:c.yaw+yaw,pitch:Math.max(-1.3,Math.min(1.3,c.pitch+pitch))}));
  const zoom=(direction:number)=>setCamera(c=>({...c,zoom:Math.min(1.65,Math.max(.6,c.zoom+direction))}));
  const button="rounded-md border border-[var(--line)] px-2 py-1 text-sm";
  return <>
    <canvas className="mt-1 block aspect-[5/3] w-full touch-none rounded-md" ref={canvas} aria-label={label+" 3D scene"}
      onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,pointer:e.pointerId,yaw:camera.yaw,pitch:camera.pitch,moved:false};}}
      onPointerMove={e=>{const d=drag.current;if(!d||d.pointer!==e.pointerId)return; const dx=e.clientX-d.x,dy=e.clientY-d.y;if(!d.moved && Math.hypot(dx,dy)<5)return;d.moved=true;setCamera(c=>({...c,yaw:d.yaw-dx*.01,pitch:Math.min(1.3,Math.max(-1.3,d.pitch+dy*.01))}));}}
      onPointerCancel={()=>{drag.current=null;}}
      onPointerUp={e=>{
        const d=drag.current;drag.current=null;if(!d||d.moved)return;
        const b=e.currentTarget.getBoundingClientRect(),[r,u,v]=basis(camera),span=Math.min(b.width,b.height)*camera.zoom/2;
        const hit=[...targets].filter(t=>Math.hypot(e.clientX-(b.x+b.width/2+dot(t.position,r)*span),e.clientY-(b.y+b.height/2-dot(t.position,u)*span))<=Math.max(10,t.radius*span))
          .sort((a,b)=>dot(b.position,v)-dot(a.position,v))[0];
        if(hit) onSelect(hit.id);
      }} />
    <div className="flex flex-wrap gap-2">
      <button className={button} type="button" onClick={()=>orbit(-.22)}>Rotate left</button>
      <button className={button} type="button" onClick={()=>orbit(.22)}>Rotate right</button>
      <button className={button} type="button" onClick={()=>orbit(0,.22)}>Tilt up</button>
      <button className={button} type="button" onClick={()=>orbit(0,-.22)}>Tilt down</button>
      <button className={button} type="button" onClick={()=>zoom(.15)}>Zoom in</button>
      <button className={button} type="button" onClick={()=>zoom(-.15)}>Zoom out</button>
      <button className={button} type="button" onClick={()=>setCamera(initial)}>Reset view</button>
    </div>
  </>;
}
