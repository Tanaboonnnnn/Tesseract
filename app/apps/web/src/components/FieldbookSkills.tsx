import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Empty, ErrorNote, Loading } from "./ui.tsx";
import { api, type DomainLevel } from "../lib/api.ts";
import { assessedSkillCount, assessmentTrend, skillCoverage } from "../lib/fieldbook-skills.ts";
import { shortDate } from "../lib/format.ts";
import { SOURCE_LABEL } from "../lib/labels.ts";

type Props = {
  domains?: DomainLevel[];
  domain?: DomainLevel;
  skillId: string | null;
  pending: boolean;
  error: unknown;
  go: (next: { domain?: string | null; skill?: string | null }) => void;
};

export function FieldbookSkills({domains, domain, skillId, pending, error, go}: Props) {
  if (skillId) return <SkillDetail id={skillId} onBack={() => go({skill:null})} domain={domain?.title}/>;
  const coverage = skillCoverage(domains ?? []);
  const assessed = domain && assessedSkillCount(domain.skills);
  return <div className="fieldbook-skills">
    <header className="fk-heading">
      <p className="fk-label">Fieldbook / Skills</p>
      <h1>{domain?.title ?? "Skills"}</h1>
      <p>{domain ? `${assessed} of ${domain.skills.length} skills assessed` : "Compare domains, then open one to see its skills."}</p>
      {domain && <button className="fk-back" onClick={() => go({domain:null,skill:null})}><ArrowLeft size={16}/> All domains</button>}
    </header>
    {pending ? <Loading/> : error ? <ErrorNote error={error}/> : <div className="fk-columns">
      <section className="fk-card">
        <h2>{domain ? `Skills in ${domain.title}` : "All domains"}</h2>
        <p className="fk-muted">Scale: 0–100 · select a {domain ? "skill" : "domain"}</p>
        <ul className="fk-list">
          {domain ? domain.skills.map((s) => <ScoreRow key={s.id} title={s.title} score={s.assessments ? s.level : null}
            note={s.assessments ? `${s.assessments} assessment${s.assessments===1?"":"s"}` : "No assessment results yet"}
            onOpen={() => go({skill:s.id})}/>) : domains?.map((d) => {
              const done = assessedSkillCount(d.skills);
              return <ScoreRow key={d.id} title={d.title} score={done ? d.level : null}
                note={`${done} / ${d.skills.length} skills assessed`} onOpen={() => go({domain:d.id,skill:null})}/>;
            })}
        </ul>
        {!domain && !domains?.length && <Empty>No domains yet.</Empty>}
      </section>
      <aside className="fk-card fk-tint">
        <p className="fk-label">{domain ? "Domain level" : "Coverage"}</p>
        <strong className="fk-big">{domain ? assessed ? `${domain.level} / 100` : "Not assessed" : `${coverage.assessedDomains} of ${coverage.totalDomains}`}</strong>
        <p className="fk-muted">{domain ? `${assessed} of ${domain.skills.length} skills assessed` : "domains have results"}</p>
        <p className="fk-note">{domain ? "Level uses the existing scoring rules." : "No result isn't a score of zero."}</p>
      </aside>
    </div>}
  </div>;
}

function ScoreRow({title, score, note, onOpen}:{title:string;score:number|null;note:string;onOpen:()=>void}) {
  return <li><button className="fk-row" type="button" onClick={onOpen}>
    <span className="fk-row-line"><strong>{title}</strong><span className={score===null?"fk-muted":"fk-score"}>
      {score===null?"Not assessed":`${score} / 100`} <ChevronRight size={14} aria-hidden="true"/>
    </span></span>
    <span className={score===null?"fk-track fk-placeholder":"fk-track"} aria-hidden="true">
      {score!==null&&<span style={{width:`${score}%`}}/>}
    </span>
    <small>{note}</small>
  </button></li>;
}

function SkillDetail({id,onBack,domain}:{id:string;onBack:()=>void;domain?:string}) {
  const skill=useQuery({queryKey:["skill",id],queryFn:()=>api.skill(id)});
  const assessments=useQuery({queryKey:["assessments",id],queryFn:()=>api.assessments(id)});
  const s=skill.data;
  const history=[...(assessments.data??[])].sort((a,b)=>b.date.localeCompare(a.date));
  const points=assessmentTrend(history);
  return <div className="fieldbook-skills">
    <header className="fk-heading">
      <p className="fk-label">Fieldbook / Skills</p><h1>{s?.title??"Skill"}</h1>
      <p>Assessment history and current skill level.</p>
      <button className="fk-back" onClick={onBack}><ArrowLeft size={16}/>{domain?`Back to ${domain}`:"All domains"}</button>
    </header>
    {skill.error?<ErrorNote error={skill.error}/>:!s?<Loading/>:<div className="fk-columns">
      <div className="fk-detail">
        <dl className="fk-card fk-tint fk-stats">
          <div><dt>Current level</dt><dd>{s.assessments?s.level:"Not assessed"}</dd></div>
          <div><dt>From scores</dt><dd>{s.assessments?s.computed:"—"}</dd></div>
          <div><dt>AI adjust</dt><dd>{s.adjustment>0?"+":""}{s.adjustment}</dd></div>
        </dl>
        {points.length>1&&<section className="fk-card"><h2>Assessment trend</h2>
          <p className="fk-muted">Raw assessment scores · latest {points.length} attempts</p>
          <Trend points={points}/></section>}
        <section className="fk-card">
          <h2>Assessment history</h2>
          {assessments.error?<ErrorNote error={assessments.error}/>:assessments.isPending?<Loading/>:
            history.length?<ul className="fk-list">{history.map(a=><li key={a.id} className="fk-history">
              <div><strong>{a.title}</strong><small>{[SOURCE_LABEL[a.source]??a.source,a.difficulty].join(" · ")}</small></div><time dateTime={a.date}>{shortDate(a.date)}</time><strong className="fk-score">{a.score}</strong>
            </li>)}</ul>:<Empty>No assessments yet.</Empty>}
        </section>
        {s.adjustments.length>0&&<section className="fk-card"><h2>AI adjustments</h2>
          <ul className="fk-list">{s.adjustments.slice().reverse().map((a,i)=><li key={i} className="fk-adjustment">
            <strong>{a.delta>0?"+":""}{a.delta} · {a.agent}</strong><small>{shortDate(a.date)}</small>
            <p>{a.reason}</p>{a.evidence.length>0&&<small>Evidence: {a.evidence.join(", ")}</small>}
          </li>)}</ul></section>}
      </div>
      <aside className="fk-card">
        <p className="fk-label">Scoring notes</p>
        <p>Raw scores are shown in the chart. Current level weights difficulty and recent results.</p>
        <p className="fk-note">AI adjustments are shown separately. Easy ×0.4, medium ×0.7, hard ×1.0. AI can adjust ±15 at most, and only raise a level with evidence.</p>
      </aside>
    </div>}
  </div>;
}

function Trend({points}:{points:ReturnType<typeof assessmentTrend>}) {
  const x=(i:number)=>45+310*i/(points.length-1);
  const y=(score:number)=>142-1.16*score;
  return <svg className="fk-chart" viewBox="0 0 390 178" role="img" aria-label={`Assessment scores: ${points.map(p=>`${shortDate(p.date)}: ${p.score}`).join("; ")}`}>
    {[0,25,50,75,100].map(v=><g key={v}><line x1="40" x2="362" y1={y(v)} y2={y(v)}/><text x="27" y={y(v)+3} textAnchor="end">{v}</text></g>)}
    <polyline points={points.map((p,i)=>`${x(i)},${y(p.score)}`).join(" ")}/>
    {points.map((p,i)=><g key={i}><circle cx={x(i)} cy={y(p.score)} r="3"><title>{shortDate(p.date)}: {p.score}</title></circle>
      {(points.length<=5||i===0||i===points.length-1)&&<><text className="fk-point-label" x={x(i)} y={y(p.score)-9} textAnchor="middle">{p.score}</text>
        <text x={x(i)} y="162" textAnchor="middle">{shortDate(p.date)}</text></>}
    </g>)}
  </svg>;
}
