import { describe, it, expect } from "vitest";
import { cn, isRoutineActiveToday, todayString } from "./utils";

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
