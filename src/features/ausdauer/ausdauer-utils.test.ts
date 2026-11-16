import { describe, it, expect } from "vitest";
import { getIsoWeekYear, groupByWeek } from "./ausdauer-utils";
import type { CardioActivity } from "@/types/database";

const act = (id: string, start_date: string) =>
  ({ id, start_date, distance_m: 1000, moving_time_sec: 300 }) as unknown as CardioActivity;

describe("ISO week-year", () => {
  it("assigns early January days to the previous ISO year", () => {
    expect(getIsoWeekYear(new Date(2027, 0, 1))).toBe(2026);
    expect(getIsoWeekYear(new Date(2027, 0, 4))).toBe(2027);
  });

  it("keeps 2026-12-31 and 2027-01-01 in one group", () => {
    const groups = groupByWeek([act("a", "2026-12-31T10:00:00"), act("b", "2027-01-01T10:00:00")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
  });
});
