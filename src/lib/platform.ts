/** Plain helpers for the platform dashboard (no server or browser APIs). */
import type { FirmRow, Plan, PlatformInvoice } from "@/lib/platform.functions";

export const FIRM_STATUS_LABEL: Record<FirmRow["status"], string> = {
  trial: "Trial",
  active: "Active",
  past_due: "Overdue",
  suspended: "Suspended",
  cancelled: "Cancelled",
};
export const FIRM_STATUS_VARIANT = {
  trial: "intake",
  active: "active",
  past_due: "hold",
  suspended: "urgent",
  cancelled: "closed",
} as const;

export const PAYMENT_METHODS = ["Bank transfer", "EcoCash", "Cash", "Card", "Other"];

export function today(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Same day next month (or year); the 31st becomes the month's last day. */
export function addCycle(iso: string, cycle: "monthly" | "annual") {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const ty = cycle === "annual" ? y + 1 : m === 12 ? y + 1 : y;
  const tm = cycle === "annual" ? m : m === 12 ? 1 : m + 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${ty}-${String(tm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** What a firm pays per month, for recurring-revenue totals. */
export function monthlyValue(firm: Pick<FirmRow, "price" | "billing_cycle">) {
  if (firm.price == null) return 0;
  return firm.billing_cycle === "annual" ? firm.price / 12 : firm.price;
}

/** A firm's price on its plan and cycle, unless it has a custom one. */
export function planPrice(plan: Plan | undefined, cycle: "monthly" | "annual") {
  if (!plan) return null;
  return cycle === "annual" ? (plan.annual_price ?? plan.monthly_price * 12) : plan.monthly_price;
}

/** The next invoice a firm should get: its price, for the period from its next billing date. */
export function suggestedInvoice(firm: FirmRow, now = new Date()) {
  const start = firm.next_billing_date ?? today(now);
  const end = addCycle(start, firm.billing_cycle);
  return {
    description: `${firm.plan_name ?? "Acta"} plan, ${firm.billing_cycle === "annual" ? "annual" : "monthly"}`,
    periodStart: start,
    periodEnd: end,
    amount: firm.price ?? 0,
    currency: firm.currency,
    dueDate: addDays(start < today(now) ? today(now) : start, 14),
  };
}

export function isOverdue(inv: Pick<PlatformInvoice, "status" | "due_date">, now = new Date()) {
  return inv.status === "due" && inv.due_date < today(now);
}

export type PlatformTotals = {
  payingFirms: number;
  trials: number;
  mrr: number;
  amountDue: number;
  overdueInvoices: number;
  needsAttention: number;
  currency: string;
};

export function platformTotals(
  firms: FirmRow[],
  invoices: PlatformInvoice[],
  now = new Date(),
): PlatformTotals {
  const open = firms.filter((f) => f.status === "active" || f.status === "past_due");
  return {
    payingFirms: open.length,
    trials: firms.filter((f) => f.status === "trial").length,
    mrr: open.reduce((sum, f) => sum + monthlyValue(f), 0),
    amountDue: invoices.filter((i) => i.status === "due").reduce((sum, i) => sum + i.amount, 0),
    overdueInvoices: invoices.filter((i) => isOverdue(i, now)).length,
    needsAttention: firms.filter(
      (f) =>
        f.status === "past_due" ||
        f.overdue > 0 ||
        (f.status === "trial" && !!f.trial_ends_at && f.trial_ends_at <= addDays(today(now), 7)),
    ).length,
    currency: firms[0]?.currency ?? "USD",
  };
}

/** Lowercase dashed web address from a firm name, as the database would make it. */
export function slugFrom(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
