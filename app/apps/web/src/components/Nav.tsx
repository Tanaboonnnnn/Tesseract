/**
 * Navigation per layout (SPEC §6). Pages are shared; only the frame around them changes:
 *   system   → dark HUD sidebar        minimal  → top bar
 *   bento    → slim icon rail          notebook → bookmark tabs on the left edge
 *   terminal → command bar on top + tmux-style status bar at the bottom
 * Settings (⚙) is reachable from every nav; small pills show when Remote / Phone access is on.
 */
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CalendarDays, Ellipsis, FolderKanban, Hexagon, History, House, Info, ListChecks, NotebookPen, Radar, Settings } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router";
import { api } from "../lib/api.ts";
import { cn } from "../lib/format.ts";
import { useNow } from "../lib/now.ts";

export const NAV = [
  { to: "/", label: "Home", icon: House, end: true, mobile: true },
  { to: "/schedule", label: "Schedule", icon: CalendarDays, end: false, mobile: true },
  { to: "/projects", label: "Projects", icon: FolderKanban, end: false, mobile: true },
  { to: "/learning", label: "Learning", icon: BookOpen, end: false, mobile: true },
  { to: "/skills", label: "Skills", icon: Radar, end: false, mobile: false },
  { to: "/quizzes", label: "Quizzes", icon: ListChecks, end: false, mobile: false },
  { to: "/notes", label: "Notes", icon: NotebookPen, end: false, mobile: false },
  { to: "/activity", label: "Activity", icon: History, end: false, mobile: false },
  { to: "/guide", label: "Guide", icon: Info, end: false, mobile: false },
];
export const MORE = [...NAV.filter((n) => !n.mobile), { to: "/settings", label: "Settings", icon: Settings, end: false, mobile: false }];

/** "Remote ON" / "Phone ON" while either is active, so it is never on without you noticing. */
function useAccessPills() {
  const remote = useQuery({ queryKey: ["remote"], queryFn: api.remote, staleTime: 60_000 });
  const phone = useQuery({ queryKey: ["phone"], queryFn: api.phone, staleTime: 60_000 });
  return {
    remote: !!(remote.data?.available && remote.data.on),
    phone: !!(phone.data?.available && phone.data.on),
  };
}

function Pills({ vertical = false }: { vertical?: boolean }) {
  const p = useAccessPills();
  if (!p.remote && !p.phone) return null;
  return (
    <Link to="/settings" className={cn("sb-pills flex gap-1", vertical && "flex-col")} title="Open Settings">
      {p.remote && <span className="sb-pill">Remote ON</span>}
      {p.phone && <span className="sb-pill">Phone ON</span>}
    </Link>
  );
}

const Brand = ({ className }: { className?: string }) => (
  <Link to="/" className={cn("sb-brand flex items-center gap-2.5", className)}>
    <Hexagon size={22} className="sb-brand-icon shrink-0" />
    <span className="brand-title">Tesseract</span>
  </Link>
);

/* ---------- Solo Leveling System: the HUD sidebar ---------- */
export function SidebarNav() {
  return (
    <aside className="sb-sidebar fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-sky-400/20 bg-sidebar px-3 py-5 text-slate-300 shadow-[inset_-1px_0_24px_rgb(var(--glow-rgb)/0.08)] lg:flex">
      <Brand className="mb-8 px-3" />
      <nav className="space-y-1">
        {[...NAV, MORE[MORE.length - 1]!].map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "relative flex items-center gap-3 rounded-md px-3 py-2 font-display text-[15px] font-semibold tracking-wider uppercase transition",
                isActive
                  ? "bg-sky-400/10 text-sky-100 shadow-[inset_0_0_16px_rgb(var(--glow-rgb)/0.15)] before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-sky-400 before:shadow-[0_0_8px_rgb(var(--glow-rgb))]"
                  : "text-slate-400 hover:bg-white/5 hover:text-sky-100",
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto px-1">
        <Pills vertical />
      </div>
    </aside>
  );
}

/* ---------- Minimal / Terminal: top bar ---------- */
export function TopNav({ terminal = false }: { terminal?: boolean }) {
  return (
    <header className="sb-topbar sticky top-0 z-20 hidden border-b lg:block">
      <div className={cn("mx-auto flex h-14 items-center gap-6 px-6", terminal ? "max-w-6xl" : "max-w-5xl")}>
        {terminal ? (
          <Link to="/" className="sb-brand shrink-0 font-bold">
            tesseract<span className="sb-caret">_</span>
          </Link>
        ) : (
          <Brand />
        )}
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {NAV.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => cn("sb-toplink", isActive && "is-active")}>
              {terminal ? label.toLowerCase() : label}
            </NavLink>
          ))}
        </nav>
        <Pills />
        <NavLink to="/settings" title="Settings" aria-label="Settings" className={({ isActive }) => cn("sb-toplink sb-gear", isActive && "is-active")}>
          {terminal ? "settings" : <Settings size={18} />}
        </NavLink>
      </div>
    </header>
  );
}

/* ---------- Bento: slim icon rail ---------- */
export function RailNav() {
  return (
    <aside className="sb-rail fixed inset-y-0 left-0 z-20 hidden w-20 flex-col items-center gap-2 py-5 lg:flex">
      <Link to="/" title="Tesseract" className="sb-rail-brand mb-4 grid size-11 place-items-center">
        <Hexagon size={24} />
      </Link>
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} title={label} aria-label={label} className={({ isActive }) => cn("sb-rail-link", isActive && "is-active")}>
          <Icon size={20} />
        </NavLink>
      ))}
      <div className="mt-auto flex flex-col items-center gap-2">
        <Pills vertical />
        <NavLink to="/settings" title="Settings" aria-label="Settings" className={({ isActive }) => cn("sb-rail-link", isActive && "is-active")}>
          <Settings size={20} />
        </NavLink>
      </div>
    </aside>
  );
}

/* ---------- Notebook: bookmark tabs ---------- */
const TAB_COLORS = ["#e8a87c", "#c3d98e", "#8ecfd9", "#b8a6e0", "#f0c674", "#e89aa6", "#9bd1b0", "#c9b38a", "#a9bce8", "#d9b8a0"];
export function TabsNav() {
  return (
    <aside className="sb-tabs fixed inset-y-0 left-0 z-20 hidden w-44 flex-col py-6 lg:flex">
      <Brand className="mb-6 px-5" />
      <nav className="flex flex-col gap-1.5">
        {[...NAV, MORE[MORE.length - 1]!].map(({ to, label, icon: Icon, end }, i) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            style={{ "--tab": TAB_COLORS[i % TAB_COLORS.length] } as React.CSSProperties}
            className={({ isActive }) => cn("sb-tab", isActive && "is-active")}
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto px-4">
        <Pills vertical />
      </div>
    </aside>
  );
}

/* ---------- Terminal: tmux-style status bar ---------- */
export function StatusBar() {
  const now = useNow();
  const { pathname } = useLocation();
  const p = useAccessPills();
  const page = pathname === "/" ? "home" : pathname.slice(1).split("/").join(":");
  return (
    <footer className="sb-statusbar fixed inset-x-0 bottom-0 z-20 hidden h-7 items-center gap-3 px-4 text-[12px] lg:flex">
      <span className="sb-status-chip">[0] tesseract</span>
      <span className="min-w-0 flex-1 truncate">{page}</span>
      {p.remote && <span className="sb-status-chip">remote:on</span>}
      {p.phone && <span className="sb-status-chip">phone:on</span>}
      <span>{now.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
      <span className="sb-status-chip">{now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
    </footer>
  );
}

/* ---------- phones and small tablets: bottom bar (styled per layout in layouts.css) ---------- */
export function BottomNav() {
  const { pathname } = useLocation();
  const inMore = pathname === "/more" || MORE.some((n) => pathname.startsWith(n.to));
  const item = "flex flex-1 flex-col items-center gap-0.5 py-2.5 font-display text-[11px] font-semibold tracking-wider uppercase";
  return (
    <nav className="sb-bottombar glass-bar fixed inset-x-0 bottom-0 z-10 flex border-t pb-[env(safe-area-inset-bottom)] lg:hidden">
      {NAV.filter((n) => n.mobile).map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => cn(item, isActive ? "is-active text-accent-600 dark:text-sky-300 dark:[text-shadow:0_0_8px_rgb(var(--glow-rgb)/0.7)]" : "text-slate-500")}
        >
          <Icon size={20} />
          {label}
        </NavLink>
      ))}
      <Link to="/more" className={cn(item, inMore ? "is-active text-accent-600 dark:text-sky-300" : "text-slate-500")}>
        <Ellipsis size={20} />
        More
      </Link>
    </nav>
  );
}
