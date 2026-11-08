import { describe, it, expect } from "vitest";
import { cn, isRoutineActiveToday, todayString, toLocalDateString } from "./utils";

describe("cn", () => {
  it("merges conflicting tailwind classes, last one winning", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("drops falsy values", () => {
    const isHidden = false;
    expect(cn("flex", isHidden && "hidden", undefined)).toBe("flex");
  });
});

describe("isRoutineActiveToday", () => {
  const today = todayString();
  const shift = (days: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split("T")[0];
  };

  it("is active when no date range is set", () => {
    expect(isRoutineActiveToday(null, null)).toBe(true);
  });

  it("is inactive before the start date", () => {
    expect(isRoutineActiveToday(shift(1), null)).toBe(false);
  });

  it("is inactive after the end date", () => {
    expect(isRoutineActiveToday(null, shift(-1))).toBe(false);
  });

  it("is active inside the range, including its boundaries", () => {
    expect(isRoutineActiveToday(shift(-1), shift(1))).toBe(true);
    expect(isRoutineActiveToday(today, today)).toBe(true);
  });
});

describe("toLocalDateString", () => {
  // The test script pins TZ=Europe/Berlin, so this is the German wall clock.
  it("keeps entries made just after midnight on the new day", () => {
    // 00:30 on 8 Nov in Berlin is still 23:30 on 7 Nov in UTC.
    const justAfterMidnight = new Date("2026-11-07T23:30:00Z");
    expect(justAfterMidnight.toISOString().slice(0, 10)).toBe("2026-11-07");
    expect(toLocalDateString(justAfterMidnight)).toBe("2026-11-08");
  });

  it("also holds in summer time, where the gap is two hours", () => {
    expect(toLocalDateString(new Date("2026-07-14T22:30:00Z"))).toBe("2026-07-15");
  });
});
