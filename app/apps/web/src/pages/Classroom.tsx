import { lazy, Suspense, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { api, type CourseDetail } from "../lib/api.ts";
import { Button, Card, ErrorNote, Loading, PageHeader, inputClass } from "../components/ui.tsx";
import { Markdown } from "../components/Markdown.tsx";
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

export function CourseDraftList() {
  const session = useQuery({ queryKey: ["session"], queryFn: api.session });
  const drafts = useQuery({ queryKey: ["classroom-drafts"], queryFn: api.courseDrafts, enabled: session.data?.local === true, refetchInterval: 15000 });
  if (!session.data?.local) return null;
  return <section className="mt-8 space-y-2">
    <h2 className="font-semibold">Course drafts & revisions</h2>
    <ErrorNote error={drafts.error}/>
    {!drafts.data?.length && <p className="text-sm muted">Imported packages and drafts from ChatGPT appear here.</p>}
    {drafts.data?.map(d => <Link key={d.revision_id} className="block underline" to={"/learning/drafts/"+d.revision_id}>{d.title} · {d.published ? "Current" : "Review revision"} · {new Date(d.created_at).toLocaleString()}</Link>)}
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
  const {id=""} = useParams();
  const query = useQuery({queryKey:[draft?"classroom-draft":"classroom-course",id],queryFn:()=>draft?api.courseDraft(id):api.publishedCourse(id)});
  const hash = useLocation().hash;
  useEffect(() => { if (query.data && hash) document.getElementById(hash.slice(1))?.scrollIntoView(); }, [query.data, hash]);
  const attempts = useQuery({queryKey:["classroom-attempts",id],queryFn:()=>api.courseAttempts(id),enabled:!draft});
  const qc=useQueryClient();
  const nav=useNavigate();
  const action=useMutation({
    mutationFn:(mode:"publish"|"restore")=>api.makeCourseCurrent(id,mode),
    onSuccess:()=>{void qc.invalidateQueries(); nav("/learning/classroom/"+query.data?.course_id);}
  });
  if(query.isPending) return <Loading/>;
  if(query.error || !query.data) return <ErrorNote error={query.error}/>;
  const d=query.data;
  return <div className="space-y-5">
    <Link to="/learning" className="underline">Back to Learning</Link>
    <PageHeader title={d.title}/>
    {draft && <Card className="p-4 space-y-2">
      <p>Revision preview. Only the main computer can make a revision available in Learning. Publishing replaces the current revision, not previous scores.</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={action.isPending} onClick={()=>{if(confirm("Publish this reviewed revision in Learning?")) action.mutate("publish");}}>Publish to Learning</Button>
        <Button disabled={action.isPending} onClick={()=>{if(confirm("Restore this previously published revision?")) action.mutate("restore");}}>Restore a previous publication</Button>
      </div><ErrorNote error={action.error}/>
    </Card>}
    <nav aria-label="Lessons" className="flex flex-wrap gap-3">{d.bundle.lessons.map(l=><a key={l.id} className="underline" href={"#"+l.id} onClick={e=>{e.preventDefault(); history.replaceState(history.state,"","#"+l.id);document.getElementById(l.id)?.scrollIntoView();}}>{l.title}</a>)}</nav>
    {!draft && <p className="text-sm muted">{attempts.data?.length ?? 0} saved answers for this revision</p>}
    {d.bundle.lessons.map(l=><section key={l.id} id={l.id} className="space-y-3 scroll-mt-5 border-t border-slate-500/20 pt-5">
      <h2 className="text-xl font-semibold">{l.title}</h2><p>{l.objective}</p>
      {l.blocks.map((b,i)=> b.type==="text" ? <Markdown key={i} text={b.markdown}/> :
        <div key={i} className="space-y-2"><Suspense fallback={<Loading/>}><Visual visual={b.visual}/></Suspense><p className="text-sm muted">{b.fallback}</p></div>)}
      {l.labs.map((lab,i)=><details key={i}><summary>{lab.platform} lab · {lab.environment}</summary>
        <p>{lab.prerequisites.join(" · ")}</p><ol className="ml-5 list-decimal">{lab.steps.map((x,j)=><li key={j}>{x}</li>)}</ol><p>Expected: {lab.expected}</p>{lab.cleanup && <p>Cleanup: {lab.cleanup}</p>}
      </details>)}
      {l.questions.map(q=>draft ? <details key={q.id}><summary>{q.prompt}</summary>{q.type==="explain" ? <><p>{q.model_answer}</p><ul className="list-disc ml-5">{q.rubric.map((r,i)=><li key={i}>{r}</li>)}</ul></> :
        <><ul className="list-disc ml-5">{q.choices.map((choice,i)=><li key={i}>{choice}{q.correct.includes(i) ? " (correct)" : ""}</li>)}</ul><p>{q.explanation}</p></>}</details> :
        <Answer key={d.revision_id+":"+l.id+":"+q.id} course={d} lesson={l.id} q={q}/>)}
      <div className="flex flex-wrap gap-3 text-sm">
        {d.bundle.sources.filter(s=>l.source_ids.includes(s.id)).map(s=><a key={s.id} href={s.url} className="underline" target="_blank" rel="noreferrer">{s.title}</a>)}
      </div>
    </section>)}
    {!draft && <RelatedTasks id={d.course_id}/>}
  </div>;
}

function Answer({course,lesson,q}:{course:CourseDetail;lesson:string;q:Bundle["lessons"][number]["questions"][number]}) {
  const [written,write]=useState("");
  const [choices,choose]=useState<number[]>([]);
  const [submitted,setSubmitted]=useState(false);
  const [attempt]=useState(()=>crypto.randomUUID());
  const qc=useQueryClient();
  const save=useMutation({mutationFn:()=>api.submitCourseAnswer(course.course_id,{
    revision_id:course.revision_id, attempt_id:attempt, lesson_id:lesson, question_id:q.id, answer:q.type==="explain"?written:choices
  }),onSuccess:()=>{setSubmitted(true);void qc.invalidateQueries({queryKey:["classroom-attempts",course.course_id]});}});
  return <Card className="p-3 space-y-2">
    <p className="font-semibold">{q.prompt}</p>
    {q.type==="explain" ? <textarea aria-label="Your answer" className={inputClass} maxLength={4000} disabled={submitted||save.isPending} value={written} onChange={e=>write(e.target.value)}/> :
      q.choices.map((s,i)=><label className="block" key={i}><input type={q.type==="single"?"radio":"checkbox"} name={attempt} disabled={submitted||save.isPending} checked={choices.includes(i)} onChange={()=>choose(xs=>q.type==="single"?[i]:xs.includes(i)?xs.filter(x=>x!==i):[...xs,i])}/> {s}</label>)}
    <ErrorNote error={save.error}/>
    {!submitted && <Button disabled={save.isPending || (q.type==="explain"?!written.trim():!choices.length)} onClick={()=>save.mutate()}>Check answer</Button>}
    {submitted && <div aria-live="polite">{q.type==="explain" ? <><p>{q.model_answer}</p><ul className="list-disc ml-5">{q.rubric.map((r,i)=><li key={i}>{r}</li>)}</ul></> : <p>{save.data?.score===1?"Correct. ":"Review this one. "}{q.explanation}</p>}</div>}
  </Card>;
}
