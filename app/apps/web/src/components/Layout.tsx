/** App frame: the navigation for the chosen layout (UI theme) around the shared pages. */
import { Outlet } from "react-router";
import { cn } from "../lib/format.ts";
import { useLayout } from "../lib/theme.ts";
import { BottomNav, RailNav, SidebarNav, StatusBar, TabsNav, TopNav } from "./Nav.tsx";

export { MORE } from "./Nav.tsx";

/** Room each desktop nav takes, so the page is never under it. */
const FRAME: Record<string, string> = {
  system: "lg:pl-60",
  minimal: "",
  bento: "lg:pl-20",
  notebook: "lg:pl-44",
  terminal: "lg:pb-7",
};

export function Layout() {
  const [layout] = useLayout();
  return (
    <div className={cn("sb-frame min-h-dvh", FRAME[layout])}>
      {layout === "system" && <SidebarNav />}
      {(layout === "minimal" || layout === "terminal") && <TopNav terminal={layout === "terminal"} />}
      {layout === "bento" && <RailNav />}
      {layout === "notebook" && <TabsNav />}

      <main className="sb-main mx-auto max-w-6xl px-4 pt-6 pb-24 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12">
        <Outlet />
      </main>

      {layout === "terminal" && <StatusBar />}
      <BottomNav />
    </div>
  );
}
