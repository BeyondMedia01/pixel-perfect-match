import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isPast, parseISO } from "date-fns";
import { ArrowLeft, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_VARIANTS, fmtHours, fmtMoney } from "@/lib/billing";
import { useFirmProfile, firmLogoUrl } from "@/lib/firm";
import { EmptyState } from "@/components/app-shell";
import {
  InvoiceStatusSelect,
  invoiceSubtotal,
  invoiceTotal,
  type Invoice,
} from "@/components/matter-billing";
import { ActaLogo } from "@/components/acta-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/invoices/$id")({
  head: () => ({
    meta: [
      { title: "Invoice — Acta" },
      { name: "description", content: "Invoice ready to print or save as PDF." },
    ],
  }),
  component: InvoicePage,
});

type InvoiceDetail = Invoice & {
  invoice_items: { id: string; description: string; quantity: number; unit_price: number }[];
  matters: {
    id: string;
    matter_number: string | null;
    title: string;
    case_number: string | null;
  } | null;
  clients: {
    id: string;
    name: string;
    address: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

function InvoicePage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: firm } = useFirmProfile();
  const { data: inv, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () =>
      (
        await supabase
          .from("invoices")
          .select(
            "*, invoice_items(id, description, quantity, unit_price), matters(id, matter_number, title, case_number), clients(id, name, address, email, phone)",
          )
          .eq("id", id)
          .maybeSingle()
      ).data as InvoiceDetail | null,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!inv)
    return (
      <EmptyState
        title="Invoice not found"
        body="It may have been deleted, or you may not have access to its matter."
        action={
          <Button asChild variant="outline">
            <Link to="/billing">Back to billing</Link>
          </Button>
        }
      />
    );

  const subtotal = invoiceSubtotal(inv);
  const total = invoiceTotal(inv);
  const vat = Math.round((total - subtotal) * 100) / 100;
  const overdue = inv.status === "sent" && isPast(parseISO(inv.due_date));
  const logo = firmLogoUrl(firm?.logo_path);
  const firmName = firm?.firm_name || "Your firm";
  const timeBased = inv.invoice_items.every((it) =>
    /\(\d{1,2} \w{3} \d{4}\)$/.test(it.description),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link to="/matters/$id" params={{ id: inv.matter_id }}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to matter
          </Link>
        </Button>
        <div className="ml-auto flex items-center gap-2">
          {overdue && <Badge variant="urgent">Overdue</Badge>}
          <InvoiceStatusSelect
            invoice={inv}
            onDone={() => {
              qc.invalidateQueries({ queryKey: ["invoice", id] });
              qc.invalidateQueries({ queryKey: ["invoices"] });
            }}
          />
          <Button onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" />
            Print or save as PDF
          </Button>
        </div>
      </div>
      {!firm?.firm_name && (
        <p className="mb-4 rounded-md border border-dashed bg-card px-4 py-3 text-sm text-muted-foreground print:hidden">
          Add your firm's name, logo, address and bank details in{" "}
          <Link to="/settings" hash="firm-profile" className="underline">
            Settings → Firm profile
          </Link>{" "}
          so they appear on invoices.
        </p>
      )}

      {/* The sheet: white paper in every theme, so print and screen match. */}
      <article className="invoice-sheet rounded-lg border bg-white p-8 text-[#01141b] shadow-sm sm:p-12 print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-[#01141b] pb-6">
          <div>
            {logo ? (
              <img src={logo} alt={firmName} className="mb-3 max-h-14 max-w-56 object-contain" />
            ) : null}
            <p className="text-xl font-semibold">{firmName}</p>
            {firm?.address && (
              <p className="mt-1 whitespace-pre-line text-sm text-[#5e707b]">{firm.address}</p>
            )}
            <p className="mt-1 text-sm text-[#5e707b]">
              {[firm?.phone, firm?.email, firm?.website].filter(Boolean).join(" · ")}
            </p>
            {firm?.registration_no && (
              <p className="text-xs text-[#5e707b]">{firm.registration_no}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold tracking-tight">
              {inv.status === "draft" ? "Draft invoice" : "Invoice"}
            </p>
            <p className="tabular mt-1 text-lg">{inv.invoice_number}</p>
            {firm?.vat_number && (
              <p className="mt-1 text-xs text-[#5e707b]">VAT no. {firm.vat_number}</p>
            )}
            <div className="mt-2 print:hidden">
              <Badge variant={INVOICE_STATUS_VARIANTS[inv.status]}>
                {INVOICE_STATUS_LABELS[inv.status]}
              </Badge>
            </div>
          </div>
        </header>

        <section className="grid gap-6 py-6 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5e707b]">Bill to</p>
            <p className="mt-1 font-medium">{inv.clients?.name}</p>
            {inv.clients?.address && (
              <p className="whitespace-pre-line text-sm">{inv.clients.address}</p>
            )}
            {inv.clients?.email && <p className="text-sm">{inv.clients.email}</p>}
            {inv.matters && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-[#5e707b]">
                  Matter
                </p>
                <p className="text-sm">
                  <span className="tabular">{inv.matters.matter_number}</span> · {inv.matters.title}
                </p>
                {inv.matters.case_number && (
                  <p className="text-sm text-[#5e707b]">Case no. {inv.matters.case_number}</p>
                )}
              </>
            )}
          </div>
          <dl className="space-y-2 text-sm sm:text-right">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-[#5e707b]">
                Issued
              </dt>
              <dd>{format(parseISO(inv.issue_date), "d MMMM yyyy")}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-[#5e707b]">Due</dt>
              <dd className={overdue ? "font-semibold text-[#b42318]" : ""}>
                {format(parseISO(inv.due_date), "d MMMM yyyy")}
              </dd>
            </div>
          </dl>
        </section>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#dce1e4] text-left text-xs uppercase tracking-wider text-[#5e707b]">
              <th className="py-2 pr-4 font-semibold">Description</th>
              <th className="w-24 py-2 pr-4 text-right font-semibold">
                {timeBased ? "Hours" : "Qty"}
              </th>
              <th className="w-28 py-2 pr-4 text-right font-semibold">
                {timeBased ? "Rate" : "Unit price"}
              </th>
              <th className="w-32 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.invoice_items.map((it) => (
              <tr key={it.id} className="border-b border-[#eef1f3] align-top">
                <td className="py-3 pr-4">{it.description}</td>
                <td className="tabular py-3 pr-4 text-right">
                  {timeBased ? fmtHours(it.quantity) : it.quantity}
                </td>
                <td className="tabular py-3 pr-4 text-right">{fmtMoney(it.unit_price)}</td>
                <td className="tabular py-3 text-right">{fmtMoney(it.quantity * it.unit_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <dl className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-[#5e707b]">Subtotal</dt>
              <dd className="tabular">{fmtMoney(subtotal)}</dd>
            </div>
            {(inv.tax_rate ?? 0) > 0 && (
              <div className="flex justify-between">
                <dt className="text-[#5e707b]">VAT ({Number(inv.tax_rate)}%)</dt>
                <dd className="tabular">{fmtMoney(vat)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t-2 border-[#01141b] pt-2 text-base font-semibold">
              <dt>Total due (USD)</dt>
              <dd className="tabular">{fmtMoney(total)}</dd>
            </div>
          </dl>
        </div>

        {(inv.notes || firm?.bank_details || firm?.invoice_footer) && (
          <footer className="mt-10 grid gap-6 border-t border-[#dce1e4] pt-6 text-sm sm:grid-cols-2">
            {firm?.bank_details && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#5e707b]">
                  Payment details
                </p>
                <p className="mt-1 whitespace-pre-line">{firm.bank_details}</p>
              </div>
            )}
            <div>
              {inv.notes && <p className="whitespace-pre-line">{inv.notes}</p>}
              {firm?.invoice_footer && (
                <p className="mt-2 whitespace-pre-line text-[#5e707b]">{firm.invoice_footer}</p>
              )}
            </div>
          </footer>
        )}
        <p className="mt-10 flex items-center gap-1.5 text-[10px] text-[#8a9ba5] print:mt-16">
          Prepared with <ActaLogo size="sm" className="text-[#8a9ba5]" />
        </p>
      </article>
    </div>
  );
}
