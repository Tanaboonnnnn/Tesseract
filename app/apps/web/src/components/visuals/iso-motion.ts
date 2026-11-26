export type XY = readonly [number, number];
export type IsoSequence = "run" | "pause" | "end";
type Link = { id:string; kind:string; from:{object:string}; to:{object:string} };
type Beat = { highlight:readonly string[] };
export function isoFlowBeat(links:readonly Link[], steps:readonly Beat[], index:number) {
  const moving: {id:string;after?:string}[] = [];
  const parked: string[] = [];
  if(!steps[index]) return {moving,parked};
  const flows = links.filter(link=>link.kind==="flow");
  const focus = new Set(steps[index].highlight);
  const active = flows.filter(link=>focus.has(link.id));
  // Only follow explicitly authored flows. Carry the token through focused arrival beats;
  // never bridge unrelated devices or guess one source where multiple flows converge.
  function arrivals(at:string) {
    for(let i=index-1;i>=0;i--) {
      const prev = steps[i]!.highlight;
      const incoming = flows.filter(link=>link.to.object===at&&prev.includes(link.id));
      if(incoming.length) return incoming;
      if(!prev.includes(at)) break;
    }
    return [];
  }
  for(const link of active) {
    const prior = arrivals(link.from.object);
    moving.push(prior.length===1?{id:link.id,after:prior[0]!.id}:{id:link.id});
  }
  for(const id of focus) {
    if(active.some(link=>link.from.object===id)) continue;
    for(const incoming of arrivals(id)) {
      if(!focus.has(incoming.id)&&!parked.includes(incoming.id)) parked.push(incoming.id);
    }
  }
  return {moving,parked};
}
export function isoBeatTime(beat: ReturnType<typeof isoFlowBeat>) {
  if(beat.moving.length) return {duration:2200,travel:1800};
  return {duration:beat.parked.length?1500:2100,travel:0};
}

export function routeMotion(points: readonly XY[]): Keyframe[] {
  if(points.length<2) return [];
  const length=points.map((p,i)=>i?Math.hypot(p[0]-points[i-1]![0],p[1]-points[i-1]![1]):0);
  const total=length.reduce((a,b)=>a+b,0);
  if(!total)return [];
  let distance=0;
  return points.map(([x,y],i)=>{
    distance+=length[i]!;
    return {offset:distance/total,transform:`translate(${x}px, ${y}px)`};
  });
}
