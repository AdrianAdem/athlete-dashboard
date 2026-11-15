import { useEffect, useRef } from "react";
import { todayString } from "./utils";

/**
 * Calls `onNewDay` when the app comes back to the foreground on a different
 * calendar day than the one it last saw.
 *
 * An installed PWA is resumed, not reloaded: left open overnight it kept
 * showing yesterday's calories and todos, and ticking a routine step built on
 * yesterday's log.
 */
export function useDayChange(onNewDay: (today: string) => void) {
  const lastSeen = useRef(todayString());
  const callback = useRef(onNewDay);
  useEffect(() => {
    callback.current = onNewDay;
  }, [onNewDay]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const today = todayString();
      if (today === lastSeen.current) return;
      lastSeen.current = today;
      callback.current(today);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
}
