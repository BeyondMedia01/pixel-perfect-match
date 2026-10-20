import { describe, it, expect } from "vitest";
import { isUrgent } from "@/lib/legal";

describe("deadline urgency", () => {
  const now = new Date("2026-10-20T10:00:00Z");
  it("flags deadlines under 48 hours", () => {
    expect(isUrgent("2026-10-22T09:00:00Z", now)).toBe(true);
  });
  it("does not flag deadlines 48+ hours away", () => {
    expect(isUrgent("2026-10-22T11:00:00Z", now)).toBe(false);
  });
});
