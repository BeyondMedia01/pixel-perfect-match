import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  InvoiceTable,
  NewInvoiceDialog,
  SelectField,
  Stat,
  shortDate,
  usePlatformData,
} from "@/components/platform-ui";
import { money } from "@/lib/firm";
import type { FirmRow } from "@/lib/platform.functions";
import { addDays, isOverdue, today } from "@/lib/platform";

export const Route = createFileRoute("/platform/billing")({
  component: PlatformBilling,
});

function PlatformBilling() {
  const { data, isPending } = usePlatformData();
  const [show, setShow] = useState("open");
  const [billing, setBilling] = useState<FirmRow | null>(null);

  const invoices = useMemo(
    () =>
      (data?.invoices ?? []).filter((i) =>
        show === "open"
          ? i.status === "due"
          : show === "overdue"
            ? isOverdue(i)
            : show === "all"
              ? true
              : i.status === show,
      ),
    [data, show],
  );
  if (isPending || !data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const names = new Map(data.firms.map((f) => [f.id, f.name]));
  const now = today();
  const soon = addDays(now, 14);
  // Paying firms whose next bill is due within two weeks and who haven't been billed for it.
  const toBill = data.firms
    .filter(
      (f) =>
        (f.status === "active" ||
          f.status === "past_due" ||
          (f.status === "trial" && f.trial_ends_at && f.trial_ends_at <= soon)) &&
        f.next_billing_date &&
        f.next_billing_date <= soon,
    )
    .sort((a, b) => (a.next_billing_date! < b.next_billing_date! ? -1 : 1));
  const thisMonth = now.slice(0, 7);
  const paidThisMonth = data.invoices
    .filter((i) => i.status === "paid" && i.paid_on?.startsWith(thisMonth))
    .reduce((s, i) => s + i.amount, 0);
  const due = data.invoices.filter((i) => i.status === "due");
  const currency = data.firms[0]?.currency ?? "USD";

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Revixions" title="Billing" />
      <section aria-label="Summary" className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Waiting to be paid"
          value={money(
            due.reduce((s, i) => s + i.amount, 0),
            currency,
          )}
          note={`${due.length} invoices`}
        />
        <Stat
          label="Overdue"
          value={money(
            due.filter((i) => isOverdue(i)).reduce((s, i) => s + i.amount, 0),
            currency,
          )}
          note={`${due.filter((i) => isOverdue(i)).length} invoices`}
        />
        <Stat label="Paid this month" value={money(paidThisMonth, currency)} />
      </section>

      <section aria-labelledby="tobill-heading" className="space-y-3">
        <h2 id="tobill-heading" className="text-lg font-semibold">
          Due for billing
        </h2>
        {!toBill.length ? (
          <p className="text-sm text-muted-foreground">
            No firm's next bill falls in the next two weeks.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card text-sm">
            {toBill.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    to="/platform/firms/$id"
                    params={{ id: f.id }}
                    className="font-medium hover:underline"
                  >
                    {f.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {f.plan_name ?? "No plan"} · next bill {shortDate(f.next_billing_date)}
                    {f.next_billing_date! < now ? " (passed)" : ""}
                  </div>
                </div>
                <span className="tabular">{money(f.price, f.currency)}</span>
                <Button size="sm" variant="outline" onClick={() => setBilling(f)}>
                  Create invoice
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="inv-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="inv-heading" className="text-lg font-semibold">
            Invoices
          </h2>
          <div className="w-44">
            <SelectField
              label="Show"
              value={show}
              onChange={setShow}
              options={[
                { value: "open", label: "Waiting to be paid" },
                { value: "overdue", label: "Overdue" },
                { value: "paid", label: "Paid" },
                { value: "void", label: "Void" },
                { value: "all", label: "All" },
              ]}
            />
          </div>
        </div>
        <InvoiceTable
          invoices={invoices}
          firmName={(id) => names.get(id) ?? "Unknown firm"}
          empty="No invoices here."
        />
      </section>

      <NewInvoiceDialog
        firm={billing}
        open={!!billing}
        onOpenChange={(o) => !o && setBilling(null)}
      />
    </div>
  );
}
