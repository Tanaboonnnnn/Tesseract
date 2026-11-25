export { clsx as cn } from "clsx";

/** Local date as YYYY-MM-DD (matches core). */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parse(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

export function daysFrom(today: string, iso: string): number {
  return Math.round((parse(iso).getTime() - parse(today).getTime()) / 86_400_000);
}

/** "Today", "Tomorrow", "3d overdue", "Nov 25" */
export function dueLabel(iso: string, today = todayIso()): string {
  const d = daysFrom(today, iso);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d < 0) return `${-d}d overdue`;
  if (d < 7) return parse(iso).toLocaleDateString("en-US", { weekday: "short" });
  return shortDate(iso);
}

export function shortDate(iso: string): string {
  const d = parse(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5 || h >= 22) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function longToday(now = new Date()): string {
  return now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function label(id: string): string {
  return id.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
