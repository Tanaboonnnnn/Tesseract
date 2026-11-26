import type { Vec } from "@tesseract/core/iso-catalog";
import { isoProject } from "@tesseract/core/iso";

export type IsoTurn=0|1|2|3;
export function turnIso(turn:IsoTurn, by:number):IsoTurn {
  return (((turn+by)%4+4)%4) as IsoTurn;
}
function rotate([x,y,z]:Vec,turn:IsoTurn):Vec {
  switch(turn){
    case 1:return [-y,x,z];
    case 2:return [-x,-y,z];
    case 3:return [y,-x,z];
    default:return [x,y,z];
  }
}
export function isoCamera(turn:IsoTurn){
  return {
    project:(p:Vec)=>isoProject(rotate(p,turn)),
    depth:(p:Vec)=>{const [x,y]=rotate(p,turn);return x+y;},
    left:[2,1,0,3][turn]!,
    right:[1,0,3,2][turn]!,
  };
}
export type IsoCamera=ReturnType<typeof isoCamera>;
