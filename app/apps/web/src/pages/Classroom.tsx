import { lazy, Suspense, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { api, type CourseDetail, type CourseProgress, type CourseRevision } from "../lib/api.ts";
import { Button, Card, ErrorNote, Loading, PageHeader, inputClass } from "../components/ui.tsx";
import { lessonLabels, isThaiLesson } from "../lib/lesson-language.ts";
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
  const groups = new Map<string, CourseRevision[]>();
  for (const rev of drafts.data ?? []) groups.set(rev.course_id, [...(groups.get(rev.course_id) ?? []), rev]);
  return <section className="mt-8 space-y-3 border-t border-slate-500/20 pt-5">
    <div>
      <h2 className="font-semibold">Manage course versions</h2>
      <p className="text-sm muted">A review replaces the current version of the same course. Older versions and their answers stay in history.</p>
    </div>
    <ErrorNote error={drafts.error}/>
    {!groups.size && <p className="text-sm muted">Imported packages and drafts from ChatGPT appear here.</p>}
    {[...groups].map(([course, rows]) => {
      const current = rows.find(r => r.published);
      const pending = rows.find(r => r.latest && !r.published && !r.previously_published);
      const history = rows.filter(r => r.revision_id !== current?.revision_id && r.revision_id !== pending?.revision_id);
      return <Card key={course} className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><p className="font-semibold">{current?.title ?? rows[0]!.title}</p>
            <p className="text-sm muted">{current ? "One published version" : "Not published yet"}{pending ? " · Draft ready to review" : ""}</p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {current && <Link className="underline" to={"/learning/classroom/" + course}>Open current</Link>}
            {pending && <Link className="font-semibold underline" to={"/learning/drafts/" + pending.revision_id}>Review draft</Link>}
          </div>
        </div>
        {history.length > 0 && <details className="text-sm">
          <summary>Version history ({history.length})</summary>
          <ul className="mt-2 space-y-2">{history.map(r => <li key={r.revision_id}>
            <Link className="underline" to={"/learning/drafts/" + r.revision_id}>{new Date(r.created_at).toLocaleString()}</Link>
            <span className="ml-2 muted">{r.previously_published ? "Previously published" : "Older draft"}</span>
          </li>)}</ul>
        </details>}
      </Card>;
    })}
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
  const { hash, search } = useLocation();
  const requested = new URLSearchParams(search).get("tab");
  const tab = requested === "lab" || requested === "check" ? requested : "learn";
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
  const sections = [{id:"learn", label:label.learn}, {id:"lab",label:label.lab}, {id:"check",label:label.check}] as const;
  const sources = d.bundle.sources.filter(s => lesson.source_ids.includes(s.id));
  const downloads = sources.filter(s => /[.](pcap|pcapng)(?:$|[?#])/i.test(s.url));
  const dayBased = d.bundle.lessons.every(l => /^day-[0-9]+$/.test(l.id));
  const dayLabel = (i: number) => (dayBased ? label.day : label.lesson) + " " + (i + 1);
  return <div className="space-y-5">
    <Link to="/learning" className="underline">{label.back}</Link>
    <PageHeader title={d.title}/>
    {draft && <Card className="p-4 space-y-2">
      <p className="font-semibold">{d.published ? "Current version" : d.previously_published ? "Version history preview" : "Draft preview"}</p>
      <p className="text-sm muted">Updating replaces the current version, not the course. Unchanged questions keep their answers.</p>
      <div className="flex flex-wrap gap-2">
        {d.latest && !d.previously_published && <Button disabled={action.isPending} onClick={()=>{if(confirm("Make this reviewed draft the current course version?")) action.mutate("publish");}}>Update current course</Button>}
        {d.previously_published && !d.published && <Button disabled={action.isPending} onClick={()=>{if(confirm("Restore this previously published revision?")) action.mutate("restore");}}>Restore this version</Button>}
        {d.published && <Link className="underline" to={"/learning/classroom/" + d.course_id}>Open in Learning</Link>}
      </div><ErrorNote error={action.error}/>
    </Card>}
    <nav aria-label={label.lessonDays}>
      <label className="block sm:hidden">{dayLabel(selected)} {label.of} {d.bundle.lessons.length}
        <select className={inputClass} value={lesson.id} onChange={e => nav(lessonLink(e.target.value,"learn"))}>
          {d.bundle.lessons.map((l,i) => <option key={l.id} value={l.id}>{dayLabel(i)}: {l.title}</option>)}
        </select>
      </label>
      <div className="hidden flex-wrap gap-2 sm:flex">
        {d.bundle.lessons.map((l,i)=><Link key={l.id} to={lessonLink(l.id,"learn")} title={l.title}
          aria-current={l.id===lesson.id?"step":undefined}
          className={l.id===lesson.id?"rounded-lg bg-accent-600 px-3 py-2 text-sm font-semibold text-white":"rounded-lg border border-slate-500/25 px-3 py-2 text-sm hover:bg-[var(--panel-solid)]"}>
          {dayLabel(i)}
        </Link>)}
      </div>
    </nav>
    <section key={lesson.id} id={lesson.id} className="min-w-0 space-y-4 scroll-mt-5" lang={thai?"th":undefined}>
      <div><p className="muted text-xs uppercase tracking-wide">{dayLabel(selected)} / {d.bundle.lessons.length}</p><h2 className="text-xl font-semibold">{lesson.title}</h2></div>
      <nav aria-label={label.sections} className="flex flex-wrap gap-2 border-b border-slate-500/25">
        {sections.map(p=><Link key={p.id} to={lessonLink(lesson.id,p.id)} aria-current={p.id===tab?"page":undefined}
          className={p.id===tab?"border-b-2 border-accent-500 px-4 py-2 font-semibold":"px-4 py-2 muted hover:underline"}>
          {p.label}
        </Link>)}
      </nav>
      {tab === "learn" && <div className="space-y-4">
        <p className="max-w-[68ch] text-base leading-relaxed muted">{lesson.objective}</p>
      {(lesson.layout==="inline" || lesson.blocks.some(b=>b.type==="visual" && (b.visual.type==="scene" || b.visual.type==="iso"))) ? (
        <article aria-label={label.content} className="space-y-5">
          {lesson.blocks.length>2 && <nav aria-label={label.outline} className="flex max-w-[52rem] flex-wrap gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel-solid)] p-3">
            {lesson.blocks.map((b,i)=> {
              const heading=b.type==="text"?b.markdown.match(/^#{1,6} +([^\r\n]+)$/m)?.[1]:b.visual.title;
              return heading && <a className="rounded-full border border-[var(--line)] px-3 py-1 text-sm hover:bg-[var(--lane)]" key={i} href={"#"+lesson.id} onClick={e=>{e.preventDefault();document.getElementById(lesson.id+"-part-"+(i+1))?.scrollIntoView({block:"start"});}}>{i+1}. {heading}</a>;
            })}
          </nav>}
          {lesson.blocks.map((b,i) => b.type==="text" ? (
            <div key={i} id={lesson.id+"-part-"+(i+1)} className="max-w-[52rem] scroll-mt-5 rounded-xl border border-[var(--line)] bg-[var(--panel-solid)] px-4 py-3 sm:px-6 sm:py-4"><div className="max-w-[68ch] leading-relaxed"><Markdown text={b.markdown}/></div></div>
          ) : (
            <section key={i} id={lesson.id+"-part-"+(i+1)} aria-label={b.visual.title} className="max-w-[52rem] min-w-0 scroll-mt-5 space-y-2">
              <h3 className="text-sm font-semibold">{b.visual.title}</h3>
              <Suspense fallback={<Loading/>}><Visual visual={b.visual} language={d.bundle.language}/></Suspense>
              <details className="text-sm muted"><summary>{label.steps}</summary><p>{b.fallback}</p></details>
            </section>
          ))}
        </article>
      ) : <>
      {lesson.blocks.some(b=>b.type==="visual") && <section aria-label={label.visual} className="space-y-3">
        <h3 className="font-semibold">{label.visual}</h3>
        {lesson.blocks.flatMap((b,i)=> b.type==="visual" ? [<Card key={i} className="space-y-2 p-3 sm:p-4">
          <h4 className="font-semibold">{b.visual.title}</h4>
          <Suspense fallback={<Loading/>}><Visual visual={b.visual} language={d.bundle.language}/></Suspense>
          <details className="text-sm muted"><summary>{label.steps}</summary><p>{b.fallback}</p></details>
        </Card>] : [])}
      </section>}
      <details className="rounded-lg border border-slate-500/25 p-3" open>
        <summary className="font-semibold">{label.notes}</summary>
        {lesson.blocks.map((b,i) => b.type==="text" ? <Markdown key={i} text={b.markdown}/> : null)}
      </details>
      </>}
      </div>}
      {tab === "lab" && <div className="space-y-4">
        {!lesson.labs.length && <Card className="p-4"><p>{label.noLab}</p><p className="muted text-sm">{thai?"เลือกบทอื่นหรือไปทบทวนความเข้าใจได้":"Choose another day or check your understanding here."}</p></Card>}
        {downloads.length > 0 && <Card className="space-y-2 p-4">
          <h3 className="font-semibold">Practice files</h3>
          {downloads.map(s=><a key={s.id} href={s.url} className="block underline break-words" target="_blank" rel="noreferrer">{s.title}</a>)}
        </Card>}
        {lesson.labs.map((lab,i)=><details key={i} className="rounded-lg border border-slate-500/25 p-4" open={i===0}>
          <summary className="font-semibold">{lab.prerequisites[0] ?? "Lab " + (i+1)}</summary>
          <div className="mt-3 space-y-3">
            <p className="text-sm muted">{lab.platform === "both" ? "Windows and Linux" : lab.platform} · {lab.environment}</p>
            {lab.prerequisites.length>1 && <p>{lab.prerequisites.slice(1).join(" · ")}</p>}
            <ol className="ml-5 list-decimal space-y-2">{lab.steps.map((x,j)=><li className="whitespace-pre-wrap break-words" key={j}>{x}</li>)}</ol>
            <p><strong>Expected:</strong> {lab.expected}</p>{lab.cleanup && <p><strong>Cleanup:</strong> {lab.cleanup}</p>}
          </div>
        </details>)}
      </div>}
      {tab === "check" && <div className="space-y-4">
        <h3 className="font-semibold">{label.knowledge}</h3>
        {!draft && lesson.questions.length>0 && (progress.error ? <ErrorNote error={progress.error}/> :
          progress.isPending ? <Loading/> : <p className="text-sm muted">{saved.size} {label.saved}</p>)}
        {lesson.questions.length===0 && <p>{label.noQuestions}</p>}
        {lesson.questions.map(q=>draft ? <details key={q.id} className="rounded-lg border border-slate-500/25 p-4"><summary>{q.prompt}</summary>{q.type==="explain" ? <><p>{q.model_answer}</p><ul className="list-disc ml-5">{q.rubric.map((r,i)=><li key={i}>{r}</li>)}</ul></> :
          <><ul className="list-disc ml-5">{q.choices.map((choice,i)=><li key={i}>{choice}{q.correct.includes(i) ? " (correct)" : ""}</li>)}</ul><p>{q.explanation}</p></>}</details> :
          progress.isSuccess ? <Answer key={d.revision_id+":"+lesson.id+":"+q.id} course={d} lesson={lesson.id} q={q} saved={saved.get(q.id)}/> : null)}
      </div>}
      {tab !== "check" && sources.length>0 && <details className="text-sm muted">
        <summary>{label.sources}</summary>
        <ul className="mt-2 space-y-1">{sources.map(s=><li key={s.id}><a href={s.url} className="underline break-words" target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>
      </details>}
    </section>
    {!draft && <RelatedTasks id={d.course_id}/>}
  </div>;
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
  return <Card className="p-3 space-y-2">
    <p className="font-semibold">{q.prompt}</p>
    {q.type==="explain" ? <textarea aria-label={label.entry} className={inputClass} maxLength={4000} disabled={submitted||save.isPending} value={saved?.answer??written} onChange={e=>write(e.target.value)}/> :
      q.choices.map((s,i)=><label className="block" key={i}><input type={q.type==="single"?"radio":"checkbox"} name={attempt} disabled={submitted||save.isPending} checked={selectedChoices.includes(i)} onChange={()=>choose(xs=>q.type==="single"?[i]:xs.includes(i)?xs.filter(x=>x!==i):[...xs,i])}/> {s}</label>)}
    <ErrorNote error={save.error}/>
    {!submitted && <Button disabled={save.isPending || (q.type==="explain"?!written.trim():!choices.length)} onClick={()=>save.mutate()}>{label.submit}</Button>}
    {submitted && <div aria-live="polite">{q.type==="explain" ? <><p>{q.model_answer}</p><ul className="list-disc ml-5">{q.rubric.map((r,i)=><li key={i}>{r}</li>)}</ul></> : <p>{(saved?.score??save.data?.score)===1?label.correct:label.incorrect}{q.explanation}</p>}</div>}
  </Card>;
}
