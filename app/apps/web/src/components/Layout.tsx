/** App frame: the navigation for the chosen layout (UI theme) around the shared pages. */
import { Suspense } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { InstrumentNav } from "./InstrumentNav.tsx";
import { fieldbookPage, usesReadingLayout } from "../lib/fieldbook-workspace.ts";
import { Loading } from "./ui.tsx";
import { InsightsNav } from "./InsightsNav.tsx";
import { cn } from "../lib/format.ts";
import { useLayout, type LayoutId } from "../lib/theme.ts";
import { BottomNav, RailNav, SidebarNav, StatusBar, TabsNav, TopNav, WorkspaceNav, WorkspaceTrail, EditorialNav } from "./Nav.tsx";

export { MORE } from "./Nav.tsx";

/** Room each desktop nav takes, so the page is never under it. */
const FRAME: Record<LayoutId, string> = {
  system: "lg:pl-60",
  minimal: "",
  bento: "lg:pl-20",
  notebook: "lg:pl-44",
  terminal: "lg:pb-7",
  linear: "lg:pl-56",
  notion: "lg:pl-64",
  editorial: "",
  insights: "lg:pl-60",
  fieldbook: "lg:pl-[220px]",
  instrument: "",
};

export function Layout() {
  const [layout] = useLayout();
  const {pathname}=useLocation();
  const page=fieldbookPage(pathname);
  return (
    <div className={cn("sb-frame min-h-dvh", FRAME[layout])}>
      {(layout === "system" || layout === "fieldbook") && <SidebarNav fieldbook={layout==="fieldbook"}/>}
      {(layout === "minimal" || layout === "terminal") && <TopNav terminal={layout === "terminal"} />}
      {layout === "bento" && <RailNav />}
      {layout === "notebook" && <TabsNav />}
      {(layout === "linear" || layout === "notion") && <WorkspaceNav kind={layout} />}
      {layout === "notion" && <WorkspaceTrail />}
      {layout === "editorial" && <EditorialNav />}
      {layout === "insights" && <InsightsNav />}
      {layout==="fieldbook" && <header className="fk-workspace-bar">
        <nav aria-label="Workspace"><Link to="/">Workspace</Link><span aria-hidden="true">/</span>
          {pathname===page.to?<span aria-current="page">{page.title}</span>:<Link to={page.to}>{page.title}</Link>}
        </nav><span className="fk-label">Fieldbook</span>
      </header>}

      {layout==="instrument" && <InstrumentNav/>}
      <main className="sb-main mx-auto max-w-6xl px-4 pt-6 pb-24 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12" data-fieldbook-route={usesReadingLayout(layout)?page.to:undefined}>
        <Suspense fallback={<Loading />}><Outlet /></Suspense>
      </main>

      {layout === "terminal" && <StatusBar />}
      {layout!=="instrument" && <BottomNav fieldbook={layout==="fieldbook"}/>}
    </div>
  );
}
