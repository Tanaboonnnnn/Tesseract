import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LearningCard } from "../components/cards.tsx";
import { Card, Empty, ErrorNote, Loading, PageHeader } from "../components/ui.tsx";
import { api } from "../lib/api.ts";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "roadmap", label: "Roadmaps" },
  { id: "course", label: "Courses" },
] as const;

export function Learning() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const { data, error, isPending } = useQuery({ queryKey: ["learning"], queryFn: api.learning });
  const shown = (data ?? []).filter((l) => filter === "all" || l.type === filter);

  return (
    <>
      <PageHeader title="Learning" />
      <div className="seg mb-5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
          >
            {f.label}
          </button>
        ))}
      </div>
      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorNote error={error} />
      ) : shown.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((l) => (
            <LearningCard key={l.id} l={l} />
          ))}
        </div>
      ) : (
        <Card>
          <Empty>Nothing here yet. Ask your AI to create a roadmap.</Empty>
        </Card>
      )}
    </>
  );
}
