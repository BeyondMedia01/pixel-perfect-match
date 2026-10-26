import { describe, expect, it } from "vitest";
import { intakeSchema } from "@/lib/intake-schema";
const valid = { name: "Test Prospect", email: "prospect@example.com", phone: "+263 77 123 4567", practice_area: "family", opposing_party: "", related_names: "", summary: "I need advice about a family matter.", consent: true, website: "" };
describe("public intake validation", () => {
  it("accepts contact details and the inquiry fields", () => expect(intakeSchema.safeParse(valid).success).toBe(true));
  it("rejects invalid email addresses", () => expect(intakeSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false));
  it("requires permission to use inquiry details", () => expect(intakeSchema.safeParse({ ...valid, consent: false }).success).toBe(false));
  it("rejects automated honeypot submissions", () => expect(intakeSchema.safeParse({ ...valid, website: "spam" }).success).toBe(false));
  it("limits inquiry descriptions to 3000 characters", () => expect(intakeSchema.safeParse({ ...valid, summary: "a".repeat(3001) }).success).toBe(false));
});