/** Presentation only: never rewrite stored lesson titles or IDs. */
export function classroomTitle(title:string) {
  const short=title.replace(/^(?:(?:day|lesson|chapter)\s+|(?:วันที่|วัน|บทที่|บท)\s*)\d+\s*[·:–—-]\s*/iu,"").trim();
  return short||title;
}

export function chapterWindow(total:number,selected:number) {
  const length=Math.min(Math.max(0,total),4);
  const start=Math.max(0,Math.min(selected-1,total-length));
  return Array.from({length},(_,i)=>start+i);
}

export function classroomOutline(blocks:readonly {type:string;markdown?:string}[],id:string) {
  return blocks.flatMap((b,i)=>{
    if(b.type!=="text"||!b.markdown)return [];
    let fence="";
    for(const line of b.markdown.split(/\r?\n/)){
      const marker=line.match(/^ {0,3}(`{3,}|~{3,})/)?.[1];
      if(marker){if(!fence)fence=marker;else if(marker[0]===fence[0]&&marker.length>=fence.length)fence="";continue;}
      if(fence)continue;
      const heading=line.match(/^ {0,3}#{1,6}\s+([^\r\n]+)$/)?.[1]?.replace(/\s+#+\s*$/,"").trim();
      if(heading)return [{id:id+"-part-"+(i+1),title:heading}];
    }
    return [];
  });
}
