import { Link } from "react-router";
import { type CourseRevision } from "../lib/api.ts";
import { fieldbookCourseLink } from "../lib/fieldbook-workspace.ts";

export function FieldbookCourseHero({course}:{course?: CourseRevision}) {
  const saved = course ? fieldbookCourseLink(course.course_id) : undefined;
  return <section className="fk-feature" aria-label="Continue learning">
    <p className="fk-label">Continue learning</p>
    <h2>{course?.title ?? "Your learning library"}</h2>
    <p className="fk-muted">{saved?.title ?? (course ? "Reviewed classroom course" : "Find a course or keep working through a roadmap.")}</p>
    <Link className="fk-primary" to={saved?.to ?? "/learning"}>{saved?.title ? "Resume chapter" : course ? "Open course" : "Browse learning"}</Link>
  </section>;
}
