import { describe, it, expect } from "vitest";
import { calculateMacros } from "./macro-calc";

describe("calculateMacros", () => {
  it("sets protein at 2g per kg of body weight", () => {
    expect(calculateMacros(2500, 80).protein).toBe(160);
  });

  it("allocates 25% of calories to fat", () => {
    // 2500 * 0.25 = 625 kcal / 9 kcal per g = 69g
    expect(calculateMacros(2500, 80).fat).toBe(69);
  });

  it("assigns the remaining calories to carbs", () => {
    // 2500 - (160g * 4) - 625 = 1235 kcal / 4 kcal per g = 309g
    expect(calculateMacros(2500, 80).carbs).toBe(309);
  });

  it("passes the calorie goal through unchanged", () => {
    expect(calculateMacros(1800, 70).calories).toBe(1800);
  });

  it("never returns negative carbs when protein and fat exceed the goal", () => {
    // 150kg needs 300g protein = 1200 kcal, well past a 1000 kcal goal.
    expect(calculateMacros(1000, 150).carbs).toBe(0);
  });
});
