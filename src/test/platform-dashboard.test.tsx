import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const createFirm = vi.fn();
const recordPlatformPayment = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
const navigate = vi.fn();
const today = new Date().toISOString().slice(0, 10);
const past = "2020-01-15";

const data = {
  plans: [
    {
      id: "p1",
      name: "Starter",
      description: null,
      monthly_price: 49,
      annual_price: 490,
      currency: "USD",
      user_limit: 3,
      active: true,
      sort_order: 1,
    },
    {
      id: "p2",
      name: "Firm",
      description: null,
      monthly_price: 299,
      annual_price: 2990,
      currency: "USD",
      user_limit: null,
      active: true,
      sort_order: 2,
    },
  ],
  firms: [
    {
      id: "f1",
      name: "Moyo & Partners",
      slug: "moyo",
      status: "active",
      plan_id: "p2",
      plan_name: "Firm",
      user_limit: null,
      billing_cycle: "monthly",
      price: 299,
      currency: "USD",
      trial_ends_at: null,
      next_billing_date: today,
      billing_email: null,
      notes: null,
      created_at: "2026-01-01T00:00:00Z",
      members: 6,
      seats_used: 6,
      matters: 40,
      last_active: null,
      owner_email: "pat@moyo.test",
      amount_due: 299,
      overdue: 1,
    },
    {
      id: "f2",
      name: "Chikwanha Law",
      slug: "chikwanha-law",
      status: "trial",
      plan_id: "p1",
      plan_name: "Starter",
      user_limit: 3,
      billing_cycle: "monthly",
      price: 49,
      currency: "USD",
      trial_ends_at: "2099-01-01",
      next_billing_date: "2099-01-01",
      billing_email: null,
      notes: null,
      created_at: "2026-10-01T00:00:00Z",
      members: 1,
      seats_used: 2,
      matters: 0,
      last_active: null,
      owner_email: "owner@chik.test",
      amount_due: 0,
      overdue: 0,
    },
  ],
  invoices: [
    {
      id: "i1",
      firm_id: "f1",
      invoice_number: "ACTA-2026-0001",
      description: "Firm plan, monthly",
      period_start: null,
      period_end: null,
      amount: 299,
      currency: "USD",
      status: "due",
      issued_on: past,
      due_date: past,
      paid_on: null,
      payment_method: null,
      payment_reference: null,
      notes: null,
    },
  ],
};

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => opts,
  useNavigate: () => navigate,
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/platform.functions", () => ({
  getPlatformData: async () => data,
  createFirm: (...a: unknown[]) => createFirm(...a),
  createPlatformInvoice: vi.fn(),
  recordPlatformPayment: (...a: unknown[]) => recordPlatformPayment(...a),
  voidPlatformInvoice: vi.fn(),
}));

import { Route as Home } from "@/routes/platform.index";
import { Route as Billing } from "@/routes/platform.billing";
import { ConfirmProvider } from "@/components/confirm";

function show(route: unknown) {
  const C = (route as { component: React.ComponentType }).component;
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ConfirmProvider>
        <C />
      </ConfirmProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  createFirm.mockReset();
  navigate.mockReset();
});

describe("platform dashboard", () => {
  it("summarises firms and lists them with plan, status, people and money owed", async () => {
    show(Home);
    expect(await screen.findByText("Moyo & Partners")).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Summary" });
    expect(within(summary).getAllByText("$299.00")).toHaveLength(2); // revenue (paying firm only) and owed
    expect(within(summary).getByText("1 on trial")).toBeInTheDocument();
    expect(within(summary).getByText("1 invoice overdue")).toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    expect(rows[2]).toHaveTextContent("Chikwanha Lawowner@chik.testStarter$49.00 / month");
    expect(rows[2]).toHaveTextContent("Trial");
    expect(rows[2]).toHaveTextContent("2 / 3");
    expect(rows[1]).toHaveTextContent("1 overdue");

    fireEvent.change(screen.getByLabelText("Search firms"), { target: { value: "chik" } });
    expect(screen.queryByText("Moyo & Partners")).not.toBeInTheDocument();
  });

  it("creates a firm and invites its managing partner", async () => {
    createFirm.mockResolvedValue({
      firmId: "f9",
      outcome: "link",
      message: "Send them this link.",
      link: "https://x.test/l",
    });
    show(Home);
    fireEvent.click(await screen.findByRole("button", { name: /New firm/ }));
    fireEvent.change(screen.getByLabelText("Firm name"), { target: { value: "Ndlovu Attorneys" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Thandi Ndlovu" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "thandi@ndlovu.test" } });
    expect(screen.getByText(/\$49\.00 per month/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create and invite" }));
    expect(await screen.findByLabelText("Invitation link")).toHaveValue("https://x.test/l");
    expect(createFirm).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Ndlovu Attorneys",
        planId: "p1",
        trialDays: 14,
        ownerName: "Thandi Ndlovu",
        ownerEmail: "thandi@ndlovu.test",
      }),
    });
  });

  it("shows what's due for billing and records a payment", async () => {
    show(Billing);
    const toBill = await screen.findByRole("region", { name: "Due for billing" });
    expect(within(toBill).getByText("Moyo & Partners")).toBeInTheDocument();
    expect(within(toBill).queryByText("Chikwanha Law")).not.toBeInTheDocument();
    expect(screen.getByText("Overdue", { selector: "div" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    fireEvent.change(screen.getByLabelText("Reference"), { target: { value: "FT2611" } });
    fireEvent.click(screen.getByRole("button", { name: "Mark as paid" }));
    await vi.waitFor(() =>
      expect(recordPlatformPayment).toHaveBeenCalledWith({
        data: { invoiceId: "i1", paidOn: today, method: "Bank transfer", reference: "FT2611" },
      }),
    );
  });
});
