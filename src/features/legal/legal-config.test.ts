import { describe, it, expect } from "vitest";
import { LEGAL } from "./legal-config";

// The store review and the law both need real contact details. This test keeps
// a placeholder from reaching the live site unnoticed.
describe("legal config", () => {
  it("has no TODO placeholders left", () => {
    const leftovers = Object.entries(LEGAL).filter(([, v]) => String(v).includes("TODO"));
    expect(leftovers.map(([k]) => k)).toEqual([]);
  });
});
