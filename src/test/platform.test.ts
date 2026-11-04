import { describe, expect, it } from "vitest";
import {
  addCycle,
  monthlyValue,
  planPrice,
  platformTotals,
  slugFrom,
  suggestedInvoice,
} from "@/lib/platform";
import { isPlatformAdmin, platformAdminEmails } from "@/lib/platform.server";
import type { FirmRow, Plan, PlatformInvoice } from "@/lib/platform.functions";

const now = new Date("2026-11-04T10:00:00Z");
const firm = (over: Partial<FirmRow> = {}): FirmRow => ({
  id: "f1",
  name: "Moyo & Partners",
  slug: "moyo-partners",
  status: "active",
  plan_id: "p1",
  plan_name: "Practice",
  user_limit: 10,
  billing_cycle: "monthly",
  price: 129,
  currency: "USD",
  trial_ends_at: null,
  next_billing_date: "2026-11-15",
  billing_email: null,
  notes: null,
  created_at: "2026-01-01T00:00:00Z",
  members: 4,
  seats_used: 5,
  matters: 12,
  last_active: null,
  owner_email: "pat@moyo.test",
  amount_due: 0,
  overdue: 0,
  ...over,
});
const invoice = (over: Partial<PlatformInvoice> = {}): PlatformInvoice => ({
  id: "i1",
  firm_id: "f1",
  invoice_number: "ACTA-2026-0001",
  description: "Practice plan",
  period_start: null,
  period_end: null,
  amount: 129,
  currency: "USD",
  status: "due",
  issued_on: "2026-10-01",
  due_date: "2026-10-15",
  paid_on: null,
  payment_method: null,
  payment_reference: null,
  notes: null,
  ...over,
});

describe("platform billing helpers", () => {
  it("moves dates on by a month or a year, keeping month ends sensible", () => {
    expect(addCycle("2026-11-15", "monthly")).toBe("2026-12-15");
    expect(addCycle("2026-12-15", "monthly")).toBe("2027-01-15");
    expect(addCycle("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(addCycle("2028-02-29", "annual")).toBe("2029-02-28");
  });

  it("counts annual plans per month for recurring revenue", () => {
    expect(monthlyValue({ price: 1290, billing_cycle: "annual" })).toBeCloseTo(107.5);
    expect(monthlyValue({ price: 129, billing_cycle: "monthly" })).toBe(129);
    expect(monthlyValue({ price: null, billing_cycle: "monthly" })).toBe(0);
  });

  it("prices a plan by cycle, falling back to twelve months when there's no annual price", () => {
    const plan = { monthly_price: 49, annual_price: null } as Plan;
    expect(planPrice(plan, "monthly")).toBe(49);
    expect(planPrice(plan, "annual")).toBe(588);
    expect(planPrice({ ...plan, annual_price: 490 }, "annual")).toBe(490);
  });

  it("suggests the next invoice from the firm's billing date and price", () => {
    expect(suggestedInvoice(firm(), now)).toEqual({
      description: "Practice plan, monthly",
      periodStart: "2026-11-15",
      periodEnd: "2026-12-15",
      amount: 129,
      currency: "USD",
      dueDate: "2026-11-29",
    });
    // A billing date in the past is due two weeks from today, not in the past.
    expect(suggestedInvoice(firm({ next_billing_date: "2026-10-01" }), now).dueDate).toBe(
      "2026-11-18",
    );
  });

  it("totals paying firms, revenue, money owed and firms needing attention", () => {
    const t = platformTotals(
      [
        firm(),
        firm({ id: "f2", status: "past_due", overdue: 1 }),
        firm({ id: "f3", status: "trial", trial_ends_at: "2026-11-08", price: 49 }),
        firm({ id: "f4", status: "suspended" }),
        firm({ id: "f5", billing_cycle: "annual", price: 1200 }),
      ],
      [
        invoice(),
        invoice({ id: "i2", due_date: "2026-12-01" }),
        invoice({ id: "i3", status: "paid", paid_on: "2026-10-10" }),
      ],
      now,
    );
    expect(t).toMatchObject({
      payingFirms: 3,
      trials: 1,
      mrr: 129 + 129 + 100,
      amountDue: 258,
      overdueInvoices: 1,
      needsAttention: 2,
    });
  });

  it("makes a web address from a firm name", () => {
    expect(slugFrom("Moyo & Partners Legal Practitioners")).toBe(
      "moyo-partners-legal-practitioners",
    );
    expect(slugFrom("  Chikwanha Law (Pvt) Ltd. ")).toBe("chikwanha-law-pvt-ltd");
  });
});

describe("platform admins", () => {
  const allowed = platformAdminEmails(" bechanibk@gmail.com, Beyond@Uncommon.org;not-an-email ");
  it("reads the comma separated list, ignoring case and junk", () => {
    expect([...allowed]).toEqual(["bechanibk@gmail.com", "beyond@uncommon.org"]);
  });
  it("needs a listed and confirmed email", () => {
    expect(
      isPlatformAdmin({ email: "BEYOND@uncommon.org", email_confirmed_at: "2026-01-01" }, allowed),
    ).toBe(true);
    expect(
      isPlatformAdmin({ email: "beyond@uncommon.org", email_confirmed_at: null }, allowed),
    ).toBe(false);
    expect(
      isPlatformAdmin({ email: "someone@firm.test", email_confirmed_at: "2026-01-01" }, allowed),
    ).toBe(false);
    expect(isPlatformAdmin(null, allowed)).toBe(false);
    expect(
      isPlatformAdmin({ email: "beyond@uncommon.org", email_confirmed_at: "x" }, new Set()),
    ).toBe(false);
  });
});
