/** One study visual, big, with its step player (SPEC §4.16). Reached from the topic's Review button. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Trash } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { Button, Card, Chip, ErrorNote, Loading } from "../components/ui.tsx";
import { VisualList } from "../components/VisualList.tsx";
import { Visual } from "../components/visuals/Visual.tsx";
import { VISUAL_META } from "../components/visuals/meta.tsx";
import { api } from "../lib/api.ts";
import { shortDate } from "../lib/format.ts";

export function VisualPage() {
  const { id = "", vid = "" } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const learning = useQuery({ queryKey: ["learning", id], queryFn: () => api.learningItem(id) });
  const visual = useQuery({ queryKey: ["learning", id, "visual", vid], queryFn: () => api.visual(id, vid) });
  const list = useQuery({ queryKey: ["learning", id, "visuals"], queryFn: () => api.visuals(id) });
  const remove = useMutation({
    mutationFn: () => api.deleteVisual(id, vid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["learning", id] });
      navigate(`/learning/${id}`);
    },
  });

  if (visual.isPending) return <Loading />;
  if (visual.error || !visual.data) return <ErrorNote error={visual.error ?? "Not found"} />;
  const v = visual.data;
  const meta = VISUAL_META[v.type];
  const topic = learning.data?.topics.find((t) => t.id === v.topic);
  const siblings = (list.data ?? []).filter((x) => x.id !== v.id && (v.topic ? x.topic === v.topic : true));

  return (
    <>
      <nav className="mb-4 flex items-center gap-1 text-xs text-slate-500">
        <Link to="/learning" className="hover:text-accent-600">
          Learning
        </Link>
        <ChevronRight size={12} />
        <Link to={`/learning/${id}`} className="hover:text-accent-600">
          {learning.data?.title ?? id}
        </Link>
        <ChevronRight size={12} />
        <span className="text-slate-700 dark:text-slate-300">{v.title}</span>
      </nav>

      <header className="mb-5 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="hud-title text-2xl">{v.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Chip tone="blue">
              <meta.icon size={12} className="mr-1 inline" />
              {meta.label}
            </Chip>
            {topic && <Chip>{topic.title}</Chip>}
            <span>
              by {v.author || "unknown"} · {shortDate(v.updated)}
            </span>
          </div>
        </div>
        <Button
          variant="danger"
          className="py-1 text-xs"
          onClick={() => window.confirm(`Delete “${v.title}”? You can undo it from Activity.`) && remove.mutate()}
        >
          <Trash size={13} /> Delete
        </Button>
      </header>
      <ErrorNote error={remove.error} />

      <Card className="mb-6">
        <Visual visual={v} keys learning={id} />
      </Card>

      {siblings.length > 0 && (
        <Card>
          <p className="mb-2 font-display text-[11px] font-semibold tracking-[0.15em] text-slate-500 uppercase">{topic ? `More for ${topic.title}` : "More visuals"}</p>
          <VisualList learning={id} items={siblings} />
        </Card>
      )}
    </>
  );
}
