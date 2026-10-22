import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useProfiles } from "@/lib/auth";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_VARIANTS, fmtMoney, fmtHours } from "@/lib/billing";
import { useInvoices, useTimeEntries, invoiceTotal, InvoiceStatusSelect } from "@/components/matter-billing";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Billing — Docket" }, { name: "description", content: "Time entries, invoices and outstanding balances." }] }),
  component: BillingPage,
});

function BillingPage() {
  const qc = useQueryClient();
  const { data: profiles } = useProfiles();
  const { data: invoices } = useInvoices();
  const { data: entries } = useTimeEntries();
  const refresh = () => { qc.invalidateQueries({ queryKey: ["invoices"] }); qc.invalidateQueries({ queryKey: ["time-entries"] }); };

  const inv = invoices ?? [];
  const unbilled = (entries ?? []).filter((e) => e.billable && !e.invoice_id);
  const unbilledValue = unbilled.reduce((s, e) => s + e.hours * e.hourly_rate, 0);
  const outstanding = inv.filter((i) => i.status === "sent").reduce((s, i) => s + invoiceTotal(i), 0);
  const monthStart = format(new Date(), "yyyy-MM-01");
  const paidThisMonth = inv.filter((i) => i.status === "paid" && i.issue_date >= monthStart).reduce((s, i) => s + invoiceTotal(i), 0);
  const nameOf = (uid: string) => profiles?.find((p) => p.id === uid)?.full_name ?? "—";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Money" title="Billing" />
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-normal text-muted-foreground">Unbilled time</CardTitle></CardHeader>
          <CardContent><p className="tabular font-serif text-2xl">{fmtMoney(unbilledValue)}</p><p className="text-xs text-muted-foreground">{fmtHours(unbilled.reduce((s, e) => s + e.hours, 0))} across {unbilled.length} entries</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-normal text-muted-foreground">Outstanding (sent)</CardTitle></CardHeader>
          <CardContent><p className="tabular font-serif text-2xl">{fmtMoney(outstanding)}</p><p className="text-xs text-muted-foreground">{inv.filter((i) => i.status === "sent").length} unpaid invoices</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-normal text-muted-foreground">Paid this month</CardTitle></CardHeader>
          <CardContent><p className="tabular font-serif text-2xl">{fmtMoney(paidThisMonth)}</p></CardContent></Card>
      </div>

      <h2 className="mb-3 text-lg">Invoices</h2>
      {inv.length === 0 ? (
        <EmptyState title="No invoices yet" body="Open a matter's Time & Billing tab to invoice unbilled time." />
      ) : (
        <ul className="mb-10 divide-y rounded-lg border bg-card">
          {inv.map((i) => (
            <li key={i.id} className="flex items-center gap-4 px-4 py-3 text-sm">
              <span className="tabular font-medium">{i.invoice_number}</span>
              <span className="flex-1">
                <Link to="/matters/$id" params={{ id: i.matter_id }} className="hover:underline">{i.matters?.title ?? "Matter"}</Link>
                <span className="block text-xs text-muted-foreground">{i.clients?.name ?? ""} · issued {format(new Date(i.issue_date), "d MMM yyyy")} · due {format(new Date(i.due_date), "d MMM yyyy")}</span>
              </span>
              <span className="tabular font-semibold">{fmtMoney(invoiceTotal(i))}</span>
              <InvoiceStatusSelect invoice={i} onDone={refresh} />
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-3 text-lg">Recent time entries</h2>
      {(entries ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No time has been logged yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {(entries ?? []).slice(0, 20).map((e) => (
            <li key={e.id} className="flex items-center gap-4 px-4 py-3 text-sm">
              <span className="flex-1">{e.description}
                <span className="block text-xs text-muted-foreground">{nameOf(e.user_id)} · {format(new Date(e.entry_date), "d MMM yyyy")}</span>
              </span>
              {!e.billable && <Badge variant="quiet">Non-billable</Badge>}
              {e.invoice_id && <Badge variant="closed">Invoiced</Badge>}
              <span className="tabular w-16 text-right text-xs">{fmtHours(e.hours)}</span>
              <span className="tabular w-24 text-right">{e.billable ? fmtMoney(e.hours * e.hourly_rate) : "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
