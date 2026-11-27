import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Sparkles } from "lucide-react";
import { useSearchParams } from "react-router";
import { SkillRadar } from "../components/SkillRadar.tsx";
import { FieldbookSkills } from "../components/FieldbookSkills.tsx";
import { usesReadingLayout } from "../lib/fieldbook-workspace.ts";
import { useLayout } from "../lib/theme.ts";
import { Card, Chip, Dialog, Empty, ErrorNote, Loading, PageHeader, ProgressBar, SectionTitle } from "../components/ui.tsx";
import { api, type DomainLevel } from "../lib/api.ts";
import { cn, shortDate } from "../lib/format.ts";
import { DIFFICULTY_TONE, SOURCE_LABEL } from "../lib/labels.ts";

export function Skills() {
  const [layout] = useLayout();
  const [params, setParams] = useSearchParams();
  const { data, error, isPending } = useQuery({ queryKey: ["skills"], queryFn: api.skills });

  const skillId = params.get("skill");
  // A skill link from elsewhere opens its domain too.
  const domainId = params.get("domain") ?? data?.find((d) => d.skills.some((s) => s.id === skillId))?.id ?? null;
  const domain = data?.find((d) => d.id === domainId);

  const go = (next: { domain?: string | null; skill?: string | null }) => {
    const p = new URLSearchParams();
    const d = next.domain === undefined ? domainId : next.domain;
    const s = next.skill === undefined ? skillId : next.skill;
    if (d) p.set("domain", d);
    if (s) p.set("skill", s);
    setParams(p);
  };

  if (usesReadingLayout(layout)) {
    return <FieldbookSkills domains={data} domain={domain} skillId={skillId} pending={isPending} error={error} go={go}/>;
  }

  return (
    <>
      <PageHeader title="Skills" subtitle="Levels 0–100 from assessments. Never assessed counts as 0." />
      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorNote error={error} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <SectionTitle
              action={
                domain && (
                  <button onClick={() => go({ domain: null, skill: null })} className="flex items-center gap-1 text-xs font-medium text-accent-600 hover:underline">
                    <ArrowLeft size={13} /> All domains
                  </button>
                )
              }
            >
              {domain ? `${domain.title} · ${domain.level}` : "All domains"}
            </SectionTitle>
            <SkillRadar
              data={domain ? domain.skills : data}
              height={360}
              onSelect={(id) => (domain ? go({ skill: id }) : go({ domain: id, skill: null }))}
            />
          </Card>

          <Card className="lg:col-span-2">
            {domain ? (
              <SkillList domain={domain} onOpen={(id) => go({ skill: id })} />
            ) : (
              <DomainList domains={data} onOpen={(id) => go({ domain: id })} />
            )}
          </Card>
        </div>
      )}
      <SkillDialog id={skillId} onClose={() => go({ skill: null })} />
    </>
  );
}

function Row({ title, level, sub, onClick }: { title: string; level: number; sub?: React.ReactNode; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="-mx-2 w-[calc(100%+1rem)] rounded-lg px-2 py-2 text-left hover:bg-[var(--lane)]">
        <div className="mb-1 flex items-center justify-between gap-2 text-sm">
          <span className="truncate">{title}</span>
          <span className="flex items-center gap-1 font-semibold tabular-nums">
            {level}
            <ChevronRight size={14} className="text-slate-300" />
          </span>
        </div>
        <ProgressBar value={level} />
        {sub && <div className="mt-1 text-[11px] text-slate-400">{sub}</div>}
      </button>
    </li>
  );
}

function DomainList({ domains, onOpen }: { domains: DomainLevel[]; onOpen: (id: string) => void }) {
  return (
    <>
      <SectionTitle>Domains</SectionTitle>
      <ul className="space-y-1">
        {domains.map((d) => (
          <Row
            key={d.id}
            title={d.title}
            level={d.level}
            sub={`${d.skills.filter((s) => s.assessments > 0).length}/${d.skills.length} skills assessed`}
            onClick={() => onOpen(d.id)}
          />
        ))}
      </ul>
    </>
  );
}

function SkillList({ domain, onOpen }: { domain: DomainLevel; onOpen: (id: string) => void }) {
  return (
    <>
      <SectionTitle>Skills</SectionTitle>
      <ul className="space-y-1">
        {domain.skills.map((s) => (
          <Row
            key={s.id}
            title={s.title}
            level={s.level}
            sub={
              s.assessments === 0
                ? "Not assessed"
                : `${s.assessments} assessment${s.assessments > 1 ? "s" : ""} · from scores ${s.computed}${
                    s.adjustment ? ` · AI ${s.adjustment > 0 ? "+" : ""}${s.adjustment}` : ""
                  }`
            }
            onClick={() => onOpen(s.id)}
          />
        ))}
      </ul>
    </>
  );
}

function SkillDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const skill = useQuery({ queryKey: ["skill", id], queryFn: () => api.skill(id!), enabled: !!id });
  const assessments = useQuery({ queryKey: ["assessments", id], queryFn: () => api.assessments(id!), enabled: !!id });
  const s = skill.data;

  return (
    <Dialog open={!!id} onClose={onClose} title={s?.title ?? "Skill"}>
      {skill.error ? (
        <ErrorNote error={skill.error} />
      ) : !s ? (
        <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Level" value={s.level} strong />
            <Stat label="From scores" value={s.computed} />
            <Stat label="AI adjust" value={s.adjustment ? `${s.adjustment > 0 ? "+" : ""}${s.adjustment}` : "0"} />
          </div>

          <section>
            <h4 className="mb-2 text-xs font-medium tracking-wide text-slate-400 uppercase">Assessments</h4>
            {assessments.data?.length ? (
              <ul className="max-h-48 space-y-2 overflow-y-auto">
                {assessments.data.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{a.title}</span>
                    <Chip>{SOURCE_LABEL[a.source] ?? a.source}</Chip>
                    <Chip tone={DIFFICULTY_TONE[a.difficulty]}>{a.difficulty}</Chip>
                    <span className={cn("w-8 text-right font-semibold tabular-nums", a.score < 60 && "text-rose-600")}>{a.score}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No assessments yet.</Empty>
            )}
          </section>

          {s.adjustments.length > 0 && (
            <section>
              <h4 className="mb-2 flex items-center gap-1 text-xs font-medium tracking-wide text-slate-400 uppercase">
                <Sparkles size={12} /> AI adjustments
              </h4>
              <ul className="max-h-48 space-y-3 overflow-y-auto">
                {s.adjustments
                  .slice()
                  .reverse()
                  .map((a) => (
                    <li key={a.id} className="text-sm">
                      <div className="flex items-center gap-2">
                        <span className={cn("font-semibold tabular-nums", a.delta < 0 ? "text-rose-600" : "text-emerald-600")}>
                          {a.delta > 0 ? "+" : ""}
                          {a.delta}
                        </span>
                        <span className="text-xs text-slate-400">
                          {a.agent} · {shortDate(a.date)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-slate-600 dark:text-slate-300">{a.reason}</p>
                      {a.evidence.length > 0 && <p className="mt-0.5 text-xs text-slate-400">Evidence: {a.evidence.join(", ")}</p>}
                    </li>
                  ))}
              </ul>
            </section>
          )}
          <p className="text-xs text-slate-400">
            Score × difficulty (easy 0.4, medium 0.7, hard 1.0), recent results weigh more. AI can adjust ±15 at most, and only raise it with evidence.
          </p>
        </div>
      )}
    </Dialog>
  );
}

function Stat({ label, value, strong }: { label: string; value: number | string; strong?: boolean }) {
  return (
    <div className="lane py-3">
      <p className={cn("tabular-nums", strong ? "hud-number text-3xl text-accent-600 dark:text-sky-300" : "text-lg font-semibold")}>{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}
