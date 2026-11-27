import { Box, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { fieldbookPage, INSTRUMENT_MODES, instrumentLocation } from "../lib/fieldbook-workspace.ts";
import { useTheme } from "../lib/theme.ts";
import { AccessPills } from "./Nav.tsx";

const systemScheme = () => window.matchMedia("(prefers-color-scheme: dark)");
const systemDark = () => systemScheme().matches;
function subscribeScheme(listener: () => void) {
  const scheme = systemScheme();
  scheme.addEventListener("change", listener);
  return () => scheme.removeEventListener("change", listener);
}

export function InstrumentNav() {
  const { pathname } = useLocation();
  const location = instrumentLocation(pathname);
  const [theme, setTheme] = useTheme();
  const preferredDark = useSyncExternalStore(subscribeScheme, systemDark);
  const dark = theme === "dark" || (theme === "system" && preferredDark);
  const action = dark ? "Use light theme" : "Use dark theme";

  return <>
    <header className="si-header">
      <div className="si-masthead">
        <Link to="/" className="si-brand" aria-label="Tesseract home">
          <i aria-hidden="true"><Box size={17}/></i>
          <span>Tesseract<small>Study Instrument / I</small></span>
        </Link>
        <div className="si-controls">
          <AccessPills/>
          <button type="button" title={action} aria-label={action} className="si-theme" onClick={() => setTheme(dark ? "light" : "dark")}>
            {dark ? <Sun size={17} aria-hidden="true"/> : <Moon size={17} aria-hidden="true"/>}
          </button>
        </div>
      </div>
      <div className="si-deck">
        <nav className="si-modes" aria-label="Workspace modes">
          {INSTRUMENT_MODES.map((mode,index) =>
            <Link className="si-mode" key={mode.id} to={mode.routes[0]} data-active={location.mode===mode.id || undefined}
              aria-current={location.mode===mode.id ? "true" : undefined}>
              <span aria-hidden="true">0{index+1}</span><span>{mode.title}</span><i aria-hidden="true"/>
            </Link>
          )}
        </nav>
        <nav className="si-routes" aria-label="Study Instrument navigation">
          {location.routes.map(route => <NavLink key={route} to={route} end={route==="/"}>{fieldbookPage(route).title}</NavLink>)}
        </nav>
      </div>
    </header>
    <div className="si-route-strip"><span>{location.modeTitle} / {location.title}</span><span>Local workspace</span></div>
  </>;
}
