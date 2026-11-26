import { lazy, Suspense, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { Trash2 } from "lucide-react";
import { api, type CourseDetail, type CourseProgress, type CourseRevision } from "../lib/api.ts";
import { Button, Card, ErrorNote, Loading, inputClass } from "../components/ui.tsx";
import { lessonLabels, isThaiLesson } from "../lib/lesson-language.ts";
import { Markdown } from "../components/Markdown.tsx";
import { chapterWindow, classroomOutline, classroomTitle } from "../lib/classroom-layout.ts";
import { rememberFieldbookLesson } from "../lib/fieldbook-workspace.ts";
import { useLayout } from "../lib/theme.ts";
import classroomMark from "./classroom-mark.svg";
import "@fontsource/ibm-plex-sans-thai/400.css";
import "@fontsource/ibm-plex-sans-thai/600.css";
import "@fontsource/ibm-plex-sans-thai/700.css";
import "./classroom-reading.css";
const Visual = lazy(() => import("../components/visuals/Visual.tsx").then(m => ({ default: m.Visual })));

const limit = 256 * 1024;
type Bundle = CourseDetail["bundle"];
type Selection = { format: "zip" | "json"; contents: string; request_id: string; bundle: Bundle; base?: string };

export function CourseActions() {
  const session = useQuery({ queryKey: ["session"], queryFn: api.session });
  const qc = useQueryClient();
  const nav = useNavigate();
  const [mode, setMode] = useState<"new"|"import"|null>(null);
  const [title,setTitle] = useState("");
  const [selection,setSelection] = useState<Selection|null>(null);
  const create = useMutation({mutationFn: () => api.newCourse(title),onSuccess: c => {
    void qc.invalidateQueries({queryKey:["learning"]}); nav("/learning/"+c.id);
  }});
  const preview = useMutation({ mutationFn: async (file: File): Promise<Selection> => {
    if (file.size > limit) throw new Error("Choose a package no larger than 256 KiB.");
    const format = file.name.toLowerCase().endsWith(".zip") ? "zip" : file.name.toLowerCase().endsWith(".json") ? "json" : null;
    if (!format) throw new Error("Choose a .json manifest or a .zip course package.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let raw = "";
    for (const byte of bytes) raw += String.fromCharCode(byte);
    const contents = btoa(raw);
    const { bundle } = await api.previewCourseFile(format, contents);
    const current = (await api.courseDrafts()).find(x => x.course_id === bundle.course_id);
    return { bundle, format, contents, request_id: "import-"+crypto.randomUUID(), base: current?.revision_id };
  }, onSuccess: setSelection });
  const stage = useMutation({mutationFn: async () => {
    if (!selection) throw new Error("Preview the package first.");
    return api.stageCourseFile(selection.format,selection.contents,selection.request_id,selection.base);
  },onSuccess: r => {
    void qc.invalidateQueries({queryKey:["classroom-drafts"]}); nav("/learning/drafts/"+r.revision_id);
  }});
  if (!session.data?.local) return null;
  return <div className="mb-5 space-y-3">
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setMode(x => x === "new" ? null : "new")}>New course</Button>
      <Button onClick={() => setMode(x => x === "import" ? null : "import")}>Import course</Button>
    </div>
    {mode === "new" && <Card className="p-4">
      <form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();create.mutate();}}>
        <label className="grow">Course title <input className={inputClass} maxLength={100} required value={title} onChange={e=>setTitle(e.target.value)} /></label>
        <Button type="submit" disabled={create.isPending || !title.trim()}>Create empty course</Button>
      </form><ErrorNote error={create.error}/>
    </Card>}
    {mode === "import" && <Card className="p-4 space-y-3">
      <p>A version 1 <code>course.json</code> or ZIP containing that file only. Import creates a draft. No scripts, attachments, scores, or progress are imported.</p>
      <label className="block">Course file <input className={inputClass} type="file" accept=".zip,.json" disabled={preview.isPending || stage.isPending} onChange={e=>{
        setSelection(null); stage.reset(); const file = e.target.files?.[0]; if(file) preview.mutate(file);
      }}/></label>
      {preview.isPending && <Loading/>}
      <ErrorNote error={preview.error ?? stage.error}/>
      {selection && <div className="space-y-2" aria-live="polite">
        <p className="font-semibold">{selection.bundle.title}</p>
        <p>{selection.bundle.lessons.length} lessons · {selection.bundle.sources.length} sources</p>
        {selection.base && <p>This adds a revision. The current course remains unchanged until you publish it.</p>}
        <ol className="ml-5 list-decimal">{selection.bundle.lessons.map(l=><li key={l.id}>{l.title}</li>)}</ol>
        <Button onClick={()=>stage.mutate()} disabled={stage.isPending}>Save draft for review</Button>
      </div>}
    </Card>}
  </div>;
}

function CourseTrashButton({kind, title, disabled, onClick}: {
  kind: "course" | "draft"; title: string; disabled: boolean; onClick: () => void;
}) {
  return <Button type="button" variant="danger"
    className="min-h-11 border border-rose-200 bg-rose-50/70 text-rose-800 hover:border-rose-400 hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 dark:border-rose-900/80 dark:bg-rose-950/30 dark:text-rose-200 dark:hover:bg-rose-900/50"
    disabled={disabled} aria-label={`Move ${kind} to Trash: ${title}`} onClick={onClick}>
    <Trash2 size={16} aria-hidden="true" /> Move {kind} to Trash
  </Button>;
}

export function CourseDraftList() {
  const session = useQuery({ queryKey: ["session"], queryFn: api.session });
  const local = session.data?.local === true;
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const drafts = useQuery({ queryKey: ["classroom-drafts"], queryFn: api.courseDrafts, enabled: local, refetchInterval: 15000 });
  const trash = useQuery({ queryKey: ["classroom-trash"], queryFn: api.classroomTrash, enabled: local, refetchInterval: 15000 });
  const change = useMutation({
    mutationFn: ({kind, id, trashed}: {kind:"course"|"draft"; id:string; trashed:boolean}) =>
      api.setClassroomTrashed(kind, id, trashed),
    onSuccess: async ({trashed}, {kind}) => {
      await Promise.all(["classroom-trash", "classroom-drafts", "classroom-published", "classroom-draft",
        "classroom-course", "classroom-progress", "classroom-latest-receipt", "lesson-options", "related-learning-tasks"].map(key =>
        qc.invalidateQueries({queryKey:[key]})));
      setStatus(trashed ? (kind === "course" ? "Course moved to Trash." : "Draft moved to Trash.")
        : (kind === "course" ? "Course restored." : "Draft restored."));
    },
  });
  if (!local) return null;
  const moveToTrash = (kind:"course"|"draft", id:string, title:string) => {
    const explanation = kind === "course"
      ? "All versions and answers are kept and can be restored from Trash."
      : "The current published course is unchanged. You can restore this draft from Trash.";
    if (!window.confirm(`Move ${kind} “${title}” to Trash?

${explanation}`)) return;
    setStatus("");
    change.mutate({kind,id,trashed:true});
  };
  const trashDraft = (r:CourseRevision) => <CourseTrashButton kind="draft" title={r.title}
    disabled={change.isPending} onClick={()=>moveToTrash("draft",r.revision_id,r.title)}/>;
  const groups = new Map<string, CourseRevision[]>();
  for (const rev of drafts.data ?? []) groups.set(rev.course_id, [...(groups.get(rev.course_id) ?? []), rev]);
  return <section className="mt-8 space-y-3 border-t border-slate-500/20 pt-5">
    <div>
      <h2 className="font-semibold">Manage course versions</h2>
      <p className="text-sm muted">A review replaces the current version of the same course. Older versions and their answers stay in history.</p>
    </div>
    <ErrorNote error={drafts.error ?? trash.error ?? change.error}/>
    <p className={status ? "text-sm" : "sr-only"} role="status">{status}</p>
    {!groups.size && <p className="text-sm muted">Imported packages and drafts from ChatGPT appear here.</p>}
    {[...groups].map(([course, rows]) => {
      const current = rows.find(r => r.published);
      const pending = rows.find(r => r.latest && !r.published && !r.previously_published);
      const history = rows.filter(r => r.revision_id !== current?.revision_id && r.revision_id !== pending?.revision_id);
      const title = current?.title ?? rows[0]!.title;
      return <Card key={course} className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><p className="font-semibold">{title}</p>
            <p className="text-sm muted">{current ? "One published version" : "Not published yet"}{pending ? " · Draft ready to review" : ""}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {current && <Link className="underline" to={"/learning/classroom/" + course}>Open current</Link>}
            {pending && <Link className="font-semibold underline" to={"/learning/drafts/" + pending.revision_id}>Review draft</Link>}
            {pending && trashDraft(pending)}
          </div>
        </div>
        {history.length > 0 && <details className="text-sm">
          <summary>Version history ({history.length})</summary>
          <ul className="mt-2 space-y-2">{history.map(r => <li key={r.revision_id} className="flex flex-wrap items-center gap-2">
            <Link className="underline" to={"/learning/drafts/" + r.revision_id}>{new Date(r.created_at).toLocaleString()}</Link>
            <span className="muted">{r.previously_published ? "Previously published" : "Older draft"}</span>
            {!r.previously_published && trashDraft(r)}
          </li>)}</ul>
        </details>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-500/15 pt-3">
          <CourseTrashButton kind="course" title={title} disabled={change.isPending}
            onClick={()=>moveToTrash("course",course,title)}/>
          <span className="text-xs muted">Moves all versions. You can restore them from Trash.</span>
        </div>
      </Card>;
    })}
    {!!trash.data?.length && <details className="rounded-lg border border-slate-500/20 p-4 text-sm">
      <summary className="cursor-pointer font-semibold">Trash ({trash.data.length})</summary>
      <ul className="mt-2 divide-y divide-slate-500/15">{trash.data.map(item=><li key={item.kind+":"+item.id} className="flex items-center justify-between gap-3 py-2">
        <div className="min-w-0"><p className="break-words font-medium">{item.title}</p>
          <p className="muted">{item.kind === "course" ? "Course" : "Draft"} · {new Date(item.trashed_at).toLocaleString()}</p>
        </div>
        <Button type="button" variant="ghost" aria-label={`Restore ${item.kind} ${item.title}`} disabled={change.isPending}
          onClick={()=>{setStatus("");change.mutate({kind:item.kind,id:item.id,trashed:false});}}>Restore</Button>
      </li>)}</ul>
    </details>}
  </section>;
}

export function RelatedTasks({id}: {id:string}) {
  const related = useQuery({queryKey:["related-learning-tasks",id],queryFn:()=>api.relatedTasks(id)});
  if (!related.data?.length) return null;
  return <section className="mt-6 space-y-2">
    <h2 className="font-semibold">Related project tasks</h2>
    <ul>{related.data.map((t,i)=><li key={t.ref+":"+i}><Link className="underline" to={"/projects/"+t.project}>{t.projectTitle} · {t.title}</Link> ({t.status})</li>)}</ul>
  </section>;
}

export function ClassroomPage({draft=false}:{draft?:boolean}) {
  const [layout]=useLayout();
  const {id=""} = useParams();
  const query = useQuery({queryKey:[draft?"classroom-draft":"classroom-course",id],queryFn:()=>draft?api.courseDraft(id):api.publishedCourse(id)});
  const { hash, search } = useLocation();
  const requested = new URLSearchParams(search).get("tab");
  const tab = requested === "lab" || requested === "check" ? requested : "learn";
  useEffect(()=>{
    if(draft||layout!=="fieldbook"||!query.data)return;
    const lessons=query.data.bundle.lessons;
    const lesson=lessons.find(l=>l.id===hash.slice(1))??lessons[0];
    if(lesson) rememberFieldbookLesson({course:query.data.course_id,lesson:lesson.id,title:classroomTitle(lesson.title)});
  },[draft,layout,query.data,hash]);
  const revision = query.data?.revision_id ?? "";
  const progress = useQuery({
    queryKey:["classroom-progress",id,revision],
    queryFn:()=>api.courseProgress(id,revision),
    enabled:!draft && tab==="check" && !!revision,
  });
  const qc=useQueryClient();
  const nav=useNavigate();
  const action=useMutation({
    mutationFn:(mode:"publish"|"restore")=>api.makeCourseCurrent(id,mode),
    onSuccess:()=>{void qc.invalidateQueries(); nav("/learning/classroom/"+query.data?.course_id+search+hash);}
  });
  if(query.isPending) return <Loading/>;
  if(query.error || !query.data) return <ErrorNote error={query.error}/>;
  const d=query.data;
  const label=lessonLabels(d.bundle.language);
  const thai=isThaiLesson(d.bundle.language);
  const selected = Math.max(0, d.bundle.lessons.findIndex(l => l.id === hash.slice(1)));
  const lesson = d.bundle.lessons[selected]!;
  const saved = new Map(progress.data?.filter(a=>a.lesson_id===lesson.id).map(a=>[a.question_id,a]));
  const path = draft ? "/learning/drafts/" + id : "/learning/classroom/" + id;
  const lessonLink = (topic: string, panel = tab) => path + (panel === "learn" ? "" : "?tab=" + panel) + "#" + topic;
  const sections = [{id:"learn", label:label.learn}, {id:"lab",label:thai?"แล็บ":label.lab}, {id:"check",label:thai?"แบบทดสอบ":label.check}] as const;
  const sources = d.bundle.sources.filter(s => lesson.source_ids.includes(s.id));
  const downloads = sources.filter(s => /[.](pcap|pcapng)(?:$|[?#])/i.test(s.url));
  const dayBased = d.bundle.lessons.every(l => /^day-[0-9]+$/.test(l.id));
  const dayLabel = (i: number) => (dayBased ? label.day : label.lesson) + " " + (i + 1);
  const outline=classroomOutline(lesson.blocks,lesson.id);
  const topic=classroomTitle(lesson.title);
  const allChapters=thai?"ทุกบท":"All chapters";
  const chapterNumber=(i:number)=>String(i+1).padStart(2,"0");
  const toTop=()=>document.getElementById(lesson.id)?.scrollIntoView({block:"start"});
  const options=d.bundle.lessons.map((l,i)=><option key={l.id} value={l.id}>{chapterNumber(i)} · {classroomTitle(l.title)}</option>);
  const prompt=lesson.guidance?.question ?? lesson.questions[0]?.prompt;
  return <div className="classroom-reading" lang={thai?"th":undefined}>
    <header className="classroom-reading__bar">
      <Link to="/learning" aria-label={label.back}>
        <span className="classroom-reading__mark"><img src={classroomMark} alt="" width="20" height="20"/></span>
        <span className="classroom-reading__wordmark">TESSERACT</span><span className="classroom-reading__back">{label.back}</span>
      </Link>
      <p className="classroom-reading__course">{d.title}</p>
    </header>
    <div className="classroom-reading__page">
      {draft && <Card className="p-4 space-y-2 mb-5">
        <p className="font-semibold">{d.published ? "Current version" : d.previously_published ? "Version history preview" : "Draft preview"}</p>
        <p className="text-sm muted">Updating replaces the current version, not the course. Unchanged questions keep their answers.</p>
        <div className="flex flex-wrap gap-2">
          {d.latest && !d.previously_published && <Button disabled={action.isPending} onClick={()=>{if(confirm("Make this reviewed draft the current course version?")) action.mutate("publish");}}>Update current course</Button>}
          {d.previously_published && !d.published && <Button disabled={action.isPending} onClick={()=>{if(confirm("Restore this previously published revision?")) action.mutate("restore");}}>Restore this version</Button>}
          {d.published && <Link className="underline" to={"/learning/classroom/" + d.course_id}>Open in Learning</Link>}
        </div><ErrorNote error={action.error}/>
      </Card>}
      <section key={lesson.id} id={lesson.id} className="classroom-reading__lesson">
        <div className="classroom-reading__hero">
          <p className="classroom-reading__kicker">{d.title} / {thai?"ห้องเรียน":"Classroom"}</p>
          <h1>{topic}</h1>
          <p className="classroom-reading__meta">{label.lesson} {chapterNumber(selected)} {label.of} {d.bundle.lessons.length}{dayBased?<> · {thai?"แผนอ่าน":"Study plan"} {dayLabel(selected)}</>:null}</p>
        </div>
        <nav aria-label={label.lessonDays} className="classroom-reading__picker">
          <div className="classroom-reading__chips">
            {chapterWindow(d.bundle.lessons.length,selected).map(i=>{
              const l=d.bundle.lessons[i]!;
              return <Link key={l.id} to={lessonLink(l.id,"learn")} title={classroomTitle(l.title)}
                aria-current={l.id===lesson.id?"step":undefined}>{chapterNumber(i)} · {classroomTitle(l.title)}</Link>;
            })}
          </div>
          <select className="classroom-reading__compact" aria-label={label.lessonDays} value={lesson.id}
            onChange={e=>nav(lessonLink(e.target.value,"learn"))}>{options}</select>
          <select className="classroom-reading__all" aria-label={allChapters} value="" onChange={e=>{if(e.target.value)nav(lessonLink(e.target.value,"learn"));}}>
            <option value="" disabled>{allChapters}</option>{options}
          </select>
        </nav>
        <nav aria-label={label.sections} className="classroom-reading__tabs">
          {sections.map(p=><Link key={p.id} to={lessonLink(lesson.id,p.id)} aria-current={p.id===tab?"page":undefined}>{p.label}</Link>)}
        </nav>
        {tab==="learn" && <>
          <div className="classroom-reading__objective classroom-reading__measure">
            <p className="classroom-reading__kicker">{thai?"ก่อนเริ่ม":"Before you start"}</p>
            <h2>{thai?"หลังจบบทนี้":"By the end of this lesson"}</h2>
            <p>{lesson.objective}</p>
          </div>
          {outline.length>(layout==="fieldbook"?1:0)&&<nav aria-label={label.outline} className="classroom-reading__outline">
            <h2 className="font-semibold">{label.outline}</h2>
            <ul>{outline.map((item,i)=><li key={item.id}><a href={"#"+item.id} onClick={e=>{
              e.preventDefault();const target=document.getElementById(item.id);
              target?.focus({preventScroll:true});target?.scrollIntoView({block:"start"});
            }}>{chapterNumber(i)} {item.title}</a></li>)}</ul>
          </nav>}
          <article aria-label={label.content} className="classroom-reading__article">
            {lesson.blocks.map((b,i) => b.type==="text" ? (
              <div key={i} id={lesson.id+"-part-"+(i+1)} tabIndex={-1} className="classroom-reading__text"><Markdown text={b.markdown}/></div>
            ):(
              <section key={i} id={lesson.id+"-part-"+(i+1)} aria-label={b.visual.title} className="classroom-reading__visual">
                <h3>{b.visual.title}</h3>
                <Suspense fallback={<Loading/>}><Visual visual={b.visual} language={d.bundle.language}/></Suspense>
                <details><summary>{label.steps}</summary><p>{b.fallback}</p></details>
              </section>
            ))}
          </article>
          {(prompt||lesson.labs.length>0||lesson.questions.length>0)&&<section className="classroom-reading__after">
            {prompt&&<div className="classroom-reading__measure">
              <p className="classroom-reading__kicker">{thai?"ลองตอบ":"Try it first"}</p>
              <h2 className="classroom-reading__section-title">{thai?"ลองทำนายก่อนเปิดเฉลย":"Make a prediction"}</h2>
              <p className="muted">{prompt}</p>
            </div>}
            {lesson.guidance&&<div className="classroom-reading__recap classroom-reading__measure">
              <h3 className="font-semibold">{thai?"สรุปที่ควรจำ":"Key takeaways"}</h3>
              <ul>{lesson.guidance.takeaways.map((t,i)=><li key={i}>{t}</li>)}</ul>
            </div>}
            <div className="classroom-reading__next">
              {lesson.labs.length>0&&<Link to={lessonLink(lesson.id,"lab")} onClick={toTop}>{thai?"ไปแล็บ":"Open lab"}</Link>}
              {lesson.questions.length>0&&<Link to={lessonLink(lesson.id,"check")} onClick={toTop}>{thai?"ไปแบบทดสอบ":"Open check"}</Link>}
            </div>
          </section>}
        </>}
        {tab === "lab" && <PracticeLab labs={lesson.labs} downloads={downloads} thai={thai} empty={label.noLab}/>}
        {tab === "check" && <div className="classroom-reading__panel-stack classroom-reading__check">
          <h2 className="classroom-reading__section-title">{label.knowledge}</h2>
          {!draft && lesson.questions.length>0 && (progress.error ? <ErrorNote error={progress.error}/> :
            progress.isPending ? <Loading/> : <p className="text-sm muted">{saved.size} {label.saved}</p>)}
          {lesson.questions.length===0 && <p>{label.noQuestions}</p>}
          {lesson.questions.map(q=>draft ? <details key={q.id} className="classroom-reading__panel"><summary>{q.prompt}</summary>{q.type==="explain" ? <><p>{q.model_answer}</p><ul className="list-disc ml-5">{q.rubric.map((r,i)=><li key={i}>{r}</li>)}</ul></> :
            <><ul className="list-disc ml-5">{q.choices.map((choice,i)=><li key={i}>{choice}{q.correct.includes(i) ? " (correct)" : ""}</li>)}</ul><p>{q.explanation}</p></>}</details> :
            progress.isSuccess ? <Answer key={d.revision_id+":"+lesson.id+":"+q.id} course={d} lesson={lesson.id} q={q} saved={saved.get(q.id)}/> : null)}
        </div>}
        {tab !== "check" && sources.length>0 && <details className="classroom-reading__sources">
          <summary>{label.sources}</summary>
          <ul className="mt-2 space-y-1">{sources.map(s=><li key={s.id}><a href={s.url} className="underline break-words" target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>
        </details>}
      </section>
      {!draft && <RelatedTasks id={d.course_id}/>}
    </div>
  </div>;
}


function PracticeLab({labs,downloads,thai,empty}:{
  labs:Bundle["lessons"][number]["labs"]; downloads:Bundle["sources"]; thai:boolean; empty:string;
}){
  const words=thai?{
    practice:"\u0e41\u0e25\u0e47\u0e1a\u0e1b\u0e23\u0e30\u0e08\u0e33\u0e1a\u0e17",setup:"\u0e01\u0e48\u0e2d\u0e19\u0e40\u0e23\u0e34\u0e48\u0e21", steps:"\u0e02\u0e31\u0e49\u0e19\u0e15\u0e2d\u0e19", expected:"\u0e1c\u0e25\u0e17\u0e35\u0e48\u0e04\u0e27\u0e23\u0e40\u0e2b\u0e47\u0e19",
    cleanup:"\u0e40\u0e01\u0e47\u0e1a\u0e07\u0e32\u0e19",files:"\u0e44\u0e1f\u0e25\u0e4c\u0e1d\u0e36\u0e01", offline:"\u0e44\u0e21\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e15\u0e48\u0e2d\u0e40\u0e19\u0e47\u0e15",online:"\u0e15\u0e49\u0e2d\u0e07\u0e15\u0e48\u0e2d\u0e40\u0e19\u0e47\u0e15",lab:"\u0e41\u0e25\u0e47\u0e1a",
  }:{practice:"Practice lab",setup:"Before you start",steps:"Steps",expected:"What you should see",cleanup:"Cleanup",files:"Practice files",offline:"Offline",online:"Internet required",lab:"Lab"};
  const title=(lab:typeof labs[number],i:number)=>lab.title??(lab.prerequisites.length>1?lab.prerequisites[0]:undefined)??(words.lab+" "+(i+1));
  return <section className="classroom-lab" data-has-files={downloads.length>0||undefined} aria-label={words.practice}>
    {downloads.length>0&&<aside className="classroom-lab__files" aria-label={words.files}>
      <h3>{words.files}</h3>
      <ul>{downloads.map(s=><li key={s.id}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>
    </aside>}
    <div className="classroom-lab__main">
    {!labs.length&&<div><h2 className="classroom-reading__section-title">{words.practice}</h2><p className="muted">{empty}</p></div>}
    {labs.length>1&&<nav className="classroom-reading__outline classroom-lab__index" aria-label={words.practice}>
      <h2 className="font-semibold">{words.practice}</h2>
      <ul>{labs.map((lab,i)=><li key={i}><a href={"#practice-"+(i+1)} onClick={event=>{
        event.preventDefault();const item=document.getElementById("practice-"+(i+1));
        item?.focus({preventScroll:true});item?.scrollIntoView({block:"start"});
      }}>{String(i+1).padStart(2,"0")}. {title(lab,i)}</a></li>)}</ul>
    </nav>}
    {labs.map((lab,i)=>{
      const prep=lab.title||lab.prerequisites.length<2?lab.prerequisites:lab.prerequisites.slice(1);
      return <article key={i} id={"practice-"+(i+1)} tabIndex={-1} className="classroom-lab__article">
        <header>
          <p className="classroom-reading__kicker">{words.practice}{labs.length>1?" "+String(i+1).padStart(2,"0"):""}</p>
          <h2 className="classroom-reading__section-title">{title(lab,i)}</h2>
          <p className="muted">{lab.platform==="both"?"Windows / Linux":lab.platform==="windows"?"Windows":"Linux"}{" \u00b7 "}{words[lab.environment]}</p>
        </header>
        {prep.length>0&&<section data-lab-section="setup" aria-label={words.setup} className="classroom-lab__setup">
          <h3>{words.setup}</h3><ul className="classroom-lab__prereqs">{prep.map((x,j)=><li key={j}>{x}</li>)}</ul>
        </section>}
        <section data-lab-section="steps" aria-label={words.steps}>
          <h3>{words.steps}</h3>
          <ol className="classroom-lab__steps">{lab.steps.map((step,j)=>{
            const [lead,...lines]=step.split(/\r?\n/);
            const media=lab.visuals?.find(x=>x.after_step===j+1);
            return <li key={j}><div className="classroom-lab__step-text">
              <p>{lead}</p>
              {lines.filter(line=>line.trim()).map((line,k)=><p key={k} className="muted">{line}</p>)}
            </div>{media&&<section className="classroom-reading__visual classroom-lab__step-media" aria-label={media.visual.title}>
              <h3>{media.visual.title}</h3>
              <Suspense fallback={<Loading/>}><Visual visual={media.visual} language={thai?"th":"en"}/></Suspense>
              <details><summary>{thai?"\u0e2d\u0e48\u0e32\u0e19\u0e04\u0e33\u0e2d\u0e18\u0e34\u0e1a\u0e32\u0e22\u0e41\u0e17\u0e19\u0e20\u0e32\u0e1e":"Read the visual description"}</summary><p>{media.fallback}</p></details>
            </section>}</li>;
          })}</ol>
        </section>
        <section data-lab-section="expected" className="classroom-lab__result">
          <h3>{words.expected}</h3><p>{lab.expected}</p>
        </section>
        {lab.cleanup&&<section data-lab-section="cleanup"><h3>{words.cleanup}</h3><p className="muted">{lab.cleanup}</p></section>}
      </article>;
    })}
    </div>
  </section>;
}

function Answer({course,lesson,q,saved}:{course:CourseDetail;lesson:string;q:Bundle["lessons"][number]["questions"][number];saved?:CourseProgress|undefined}) {
  const label=lessonLabels(course.bundle.language);
  const [written,write]=useState("");
  const [choices,choose]=useState<number[]>([]);
  const [attempt]=useState(()=>crypto.randomUUID());
  const qc=useQueryClient();
  const save=useMutation({mutationFn:()=>api.submitCourseAnswer(course.course_id,{
    revision_id:course.revision_id, attempt_id:attempt, lesson_id:lesson, question_id:q.id, answer:q.type==="explain"?written:choices
  }),onSuccess:()=>{void qc.invalidateQueries({queryKey:["classroom-progress",course.course_id,course.revision_id]});}});
  const submitted=!!saved||save.isSuccess;
  const selectedChoices: number[]=saved&&q.type!=="explain"?JSON.parse(saved.answer):choices;
  return <div className="classroom-reading__panel space-y-2">
    <p className="font-semibold">{q.prompt}</p>
    {q.type==="explain" ? <textarea aria-label={label.entry} className={inputClass} maxLength={4000} disabled={submitted||save.isPending} value={saved?.answer??written} onChange={e=>write(e.target.value)}/> :
      q.choices.map((s,i)=><label className="classroom-reading__choice" key={i}><input type={q.type==="single"?"radio":"checkbox"} name={attempt} disabled={submitted||save.isPending} checked={selectedChoices.includes(i)} onChange={()=>choose(xs=>q.type==="single"?[i]:xs.includes(i)?xs.filter(x=>x!==i):[...xs,i])}/> {s}</label>)}
    <ErrorNote error={save.error}/>
    {!submitted && <Button className="classroom-reading__action" disabled={save.isPending || (q.type==="explain"?!written.trim():!choices.length)} onClick={()=>save.mutate()}>{label.submit}</Button>}
    {submitted && <div aria-live="polite">{q.type==="explain" ? <><p>{q.model_answer}</p><ul className="list-disc ml-5">{q.rubric.map((r,i)=><li key={i}>{r}</li>)}</ul></> : <p>{(saved?.score??save.data?.score)===1?label.correct:label.incorrect}{q.explanation}</p>}</div>}
  </div>;
}
