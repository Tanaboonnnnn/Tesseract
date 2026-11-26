export type XY = readonly [number, number];
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
