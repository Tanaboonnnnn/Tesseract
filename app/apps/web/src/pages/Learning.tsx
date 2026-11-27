import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LearningCard } from "../components/cards.tsx";
import { Card, Empty, ErrorNote, Loading, PageHeader } from "../components/ui.tsx";
import { Link } from "react-router";
import { CourseActions, CourseDraftList } from "./Classroom.tsx";
import { api } from "../lib/api.ts";
import { useLayout } from "../lib/theme.ts";
import { FieldbookCourseHero } from "../components/FieldbookCourseHero.tsx";
import { mostRecentFieldbookCourse, usesReadingLayout } from "../lib/fieldbook-workspace.ts";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "roadmap", label: "Roadmaps" },
  { id: "course", label: "Courses" },
] as const;

export function Learning() {
  const [layout]=useLayout();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const { data, error, isPending } = useQuery({ queryKey: ["learning"], queryFn: api.learning });
  const published = useQuery({queryKey:["classroom-published"], queryFn:api.publishedCourses});
  const courses = filter === "roadmap" ? [] : (published.data ?? []);
  const shown = (data ?? []).filter((l) => filter === "all" || l.type === filter);

  return (
    <>
      <PageHeader title="Learning" subtitle={usesReadingLayout(layout)?"Return to a course or choose what to learn next.":undefined}/>
      {usesReadingLayout(layout)&&courses.length>0&&<div className="mb-5"><FieldbookCourseHero course={mostRecentFieldbookCourse(courses)}/></div>}
      <CourseActions />
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
      ) : shown.length || courses.length ? (
        <div className={usesReadingLayout(layout)?"fk-course-list":"grid gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
          {courses.map(c => <Link key={c.course_id} to={"/learning/classroom/" + c.course_id} className="block"><Card className="p-4"><p className="text-xs muted">Course · Reviewed revision</p><p className="font-semibold">{c.title}</p></Card></Link>)}
          {shown.map((l) => (
            <LearningCard key={l.id} l={l} />
          ))}
        </div>
      ) : (
        <Card>
          <Empty>No lessons here yet. Create or import a course on the main computer. If you use ChatGPT, ask it to send a course draft for review.</Empty>
        </Card>
      )}
      <CourseDraftList />
    </>
  );
}
