const pages = {
  "/": { title:"Home", section:"today" },
  "/schedule": { title:"Schedule", section:"plan your time" },
  "/projects": { title:"Projects", section:"work in progress" },
  "/learning": { title:"Learning", section:"library" },
  "/skills": { title:"Skills", section:"progress" },
  "/quizzes": { title:"Quizzes", section:"retrieval practice" },
  "/notes": { title:"Notes", section:"workspace notes" },
  "/activity": { title:"Activity", section:"workspace history" },
  "/guide": { title:"Guide", section:"getting started" },
  "/settings": { title:"Settings", section:"preferences" },
  "/more": { title:"More", section:"workspace" },
} as const;
export function fieldbookPage(path:string) {
  const key = ("/"+ (path.split("/")[1] ?? "")) as keyof typeof pages;
  return pages[key] ? {...pages[key], to:key} : { title:"Workspace", section:"workspace", to:"/" };
}

const lessonStorage="tesseract:fieldbook:last-lesson";
type Resume={course:string;lesson:string;title:string};
export function rememberFieldbookLesson(next:Resume) {
  try { localStorage.setItem(lessonStorage,JSON.stringify(next)); } catch {}
}
function lastLesson():Resume|null {
  try {
    const value=JSON.parse(localStorage.getItem(lessonStorage)??"null");
    return value&&typeof value.course==="string"&&typeof value.lesson==="string"&&typeof value.title==="string"?value:null;
  } catch { return null; }
}
export function mostRecentFieldbookCourse<T extends {course_id:string; created_at:string}>(courses:readonly T[]):T|undefined {
  const last=lastLesson();
  return courses.find(c=>c.course_id===last?.course)??[...courses].sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
}
export function fieldbookCourseLink(course:string) {
  const to="/learning/classroom/"+encodeURIComponent(course);
  const last=lastLesson();
  return last?.course===course?{to:to+"#"+encodeURIComponent(last.lesson),title:last.title}:{to,title:undefined};
}
