/**
 * The current time, updated once per minute on the minute boundary (not every second).
 * Stops while the window is hidden and catches up as soon as it is shown again.
 * When the date changes (e.g. the app stays open past midnight), every query refetches so "today" is right.
 * Cost: one timer per minute and a tiny re-render of the component that uses it.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { todayIso } from "./format.ts";

export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  const qc = useQueryClient();
  const day = useRef(todayIso());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const d = new Date();
      setNow(d);
      const today = todayIso();
      if (today !== day.current) {
        day.current = today;
        qc.invalidateQueries();
      }
      clearTimeout(timer);
      if (!document.hidden) timer = setTimeout(tick, 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 50);
    };
    const onVisible = () => (document.hidden ? clearTimeout(timer) : tick());
    tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [qc]);

  return now;
}
