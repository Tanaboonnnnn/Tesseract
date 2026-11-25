import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, BookOpen, ChartNoAxesCombined, Hexagon, Search, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { api } from "../lib/api.ts";
import { cn } from "../lib/format.ts";
import { AccessPills, MORE, NAV } from "./Nav.tsx";
import { Dialog, inputClass } from "./ui.tsx";

const GROUPS = [
  { label: "Workspace", icon: ChartNoAxesCombined, items: NAV.slice(0, 4) },
  { label: "Study library", icon: BookOpen, items: NAV.slice(4, 7) },
  { label: "System", icon: Settings, items: [...NAV.slice(7), MORE.at(-1)!] },
];
const ITEMS = GROUPS.flatMap((g) => g.items);
const matches = (path: string, to: string) => path === to || (to !== "/" && path.startsWith(to + "/"));

export function InsightsNav() {
  const { pathname } = useLocation();
  const group = GROUPS.find((g) => g.items.some((item) => matches(pathname, item.to))) ?? GROUPS[0]!;
  const item = group.items.find((n) => matches(pathname, n.to));
  const [search, setSearch] = useState(false);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && matchMedia("(min-width: 1024px)").matches) {
        event.preventDefault();
        setSearch((open) => !open);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <>
      <aside className="insights-shell-side fixed inset-y-0 left-0 z-20 hidden w-60 lg:flex">
        <nav aria-label="Insights sections" className="insights-rail flex w-14 shrink-0 flex-col items-center gap-2 border-r p-2">
          <Link to="/" aria-label="Tesseract home" className="insights-symbol mb-4 grid size-9 place-items-center rounded-xl"><Hexagon size={20} /></Link>
          {GROUPS.map(({ label, icon: Icon, items }) => (
            <Link key={label} to={items[0]!.to} title={label} aria-label={label} aria-current={group.label === label ? "true" : undefined}
              className={cn("insights-rail-link grid size-9 place-items-center rounded-lg", group.label === label && "is-active")}>
              <Icon size={18} aria-hidden="true" />
            </Link>
          ))}
        </nav>
        <nav aria-label={`${group.label} pages`} className="insights-side-panel flex min-w-0 flex-1 flex-col overflow-y-auto border-r px-3 py-4">
          <Link to="/" className="mb-5 px-2 text-sm font-semibold">Tesseract</Link>
          <p className="mb-1 px-2 text-xs font-medium text-slate-600 dark:text-slate-400">{group.label}</p>
          <div className="flex-1 space-y-0.5">
            {group.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => cn("design-nav-link", isActive && "is-active")}>
                <Icon size={16} aria-hidden="true" />{to === "/" ? "Overview" : label}
              </NavLink>
            ))}
          </div>
          <AccessPills vertical />
        </nav>
      </aside>
      <header className="insights-header sticky top-0 z-10 hidden h-14 items-center justify-between gap-4 border-b px-6 lg:flex">
        <p className="min-w-0 truncate text-sm"><span className="text-slate-600 dark:text-slate-400">{group.label}</span><span aria-hidden="true"> / </span><span className="font-semibold">{item?.to === "/" ? "Overview" : item?.label ?? "Page"}</span></p>
        <button type="button" className="insights-find flex w-full max-w-sm items-center gap-2 rounded-md border px-3 py-1.5 text-left text-sm" onClick={() => setSearch(true)}>
          <Search size={15} aria-hidden="true" /><span className="min-w-0 flex-1 truncate">Find a page, project or course</span><kbd className="hidden text-xs xl:inline">Ctrl / ⌘ K</kbd>
        </button>
        <Link to="/settings" className="design-nav-link" aria-label="Settings"><Settings size={18} /></Link>
      </header>
      {search && <QuickFind onClose={() => setSearch(false)} />}
    </>
  );
}

function QuickFind({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const { data } = useQuery({ queryKey: ["overview"], queryFn: api.overview });
  const entries = [
    ...ITEMS.map((n) => ({ to: n.to, label: n.to === "/" ? "Overview" : n.label, category: "Page" })),
    ...(data?.projects.map((p) => ({ to: `/projects/${p.id}`, label: p.title, category: "Project" })) ?? []),
    ...(data?.learning.map((l) => ({ to: `/learning/${l.id}`, label: l.title, category: "Course" })) ?? []),
  ];
  const shown = entries.filter((n) => `${n.label} ${n.category}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 10);
  return (
    <Dialog title="Quick find" open onClose={onClose}>
      <input aria-label="Search pages, projects and courses" className={inputClass} autoFocus value={query} onChange={(e) => setQuery(e.target.value)} />
      {shown.length ? <ul className="mt-3 space-y-1">
        {shown.map((n) => <li key={n.to}><Link to={n.to} onClick={onClose} className="design-nav-link"><span className="min-w-0 flex-1 truncate">{n.label}</span><small className="text-slate-600 dark:text-slate-400">{n.category}</small><ArrowUpRight size={13} aria-hidden="true" /></Link></li>)}
      </ul> : <p className="py-4 text-sm">No matches.</p>}
    </Dialog>
  );
}
