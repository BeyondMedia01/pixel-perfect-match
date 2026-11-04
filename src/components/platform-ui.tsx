import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConfirm } from "@/components/confirm";
import { money } from "@/lib/firm";
import {
  createPlatformInvoice,
  getPlatformData,
  recordPlatformPayment,
  voidPlatformInvoice,
  type FirmRow,
  type PlatformInvoice,
} from "@/lib/platform.functions";
import {
  FIRM_STATUS_LABEL,
  FIRM_STATUS_VARIANT,
  PAYMENT_METHODS,
  isOverdue,
  suggestedInvoice,
  today,
} from "@/lib/platform";

export function usePlatformData() {
  return useQuery({ queryKey: ["platform"], queryFn: () => getPlatformData() });
}
export function useRefreshPlatform() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["platform"] });
}

export const shortDate = (iso: string | null | undefined) =>
  iso ? format(new Date(iso.length === 10 ? `${iso}T00:00:00` : iso), "d MMM yyyy") : "—";

export function FirmStatusBadge({ status }: { status: FirmRow["status"] }) {
  return <Badge variant={FIRM_STATUS_VARIANT[status]}>{FIRM_STATUS_LABEL[status]}</Badge>;
}

export function InvoiceStatusBadge({ invoice }: { invoice: PlatformInvoice }) {
  if (invoice.status === "paid") return <Badge variant="active">Paid</Badge>;
  if (invoice.status === "void") return <Badge variant="closed">Void</Badge>;
  return isOverdue(invoice) ? (
    <Badge variant="urgent">Overdue</Badge>
  ) : (
    <Badge variant="hold">Due</Badge>
  );
}

/** A labelled input with its id wired up. */
export function TextField({
  label,
  help,
  error,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; help?: string; error?: string }) {
  const id = useId();
  const note = error ?? help;
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={!!error}
        aria-describedby={note ? `${id}-note` : undefined}
        {...props}
      />
      {note && (
        <p
          id={`${id}-note`}
          role={error ? "alert" : undefined}
          className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}
        >
          {note}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** A one-time sign-in link to send by hand. */
export function LinkBox({ link }: { link: string }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Invitation link</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          readOnly
          value={link}
          className="text-xs"
          onFocus={(e) => e.target.select()}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Copy invitation link"
          onClick={() =>
            navigator.clipboard
              .writeText(link)
              .then(() => toast.success("Link copied"))
              .catch(() => toast.error("Couldn't copy. Select the link and copy it."))
          }
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        It signs them in, so send it only to them. It works once.
      </p>
    </div>
  );
}

/** Bill a firm, prefilled from its plan and next billing date. */
export function NewInvoiceDialog({
  firm,
  open,
  onOpenChange,
}: {
  firm: FirmRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const refresh = useRefreshPlatform();
  const [form, setForm] = useState<
    ReturnType<typeof suggestedInvoice> & { notes: string; advance: boolean }
  >();
  const [busy, setBusy] = useState(false);
  const value =
    form ?? (firm ? { ...suggestedInvoice(firm), notes: "", advance: true } : undefined);
  if (!firm || !value) return null;
  const set = (k: keyof typeof value) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...value, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(value!.amount);
    if (!(amount >= 0)) {
      toast.error("Enter an amount of 0 or more");
      return;
    }
    setBusy(true);
    try {
      const r = await createPlatformInvoice({
        data: {
          firmId: firm!.id,
          description: value!.description,
          periodStart: value!.periodStart || null,
          periodEnd: value!.periodEnd || null,
          amount,
          currency: value!.currency,
          dueDate: value!.dueDate,
          notes: value!.notes,
          advance: value!.advance,
        },
      });
      toast.success(`Invoice ${r.invoiceNumber} created`);
      refresh();
      setForm(undefined);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the invoice");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setForm(undefined);
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Invoice {firm.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <TextField
            label="Description"
            required
            value={value.description}
            onChange={set("description")}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Period from"
              type="date"
              value={value.periodStart}
              onChange={set("periodStart")}
            />
            <TextField
              label="Period to"
              type="date"
              value={value.periodEnd}
              onChange={set("periodEnd")}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <TextField
              label="Amount"
              type="number"
              min="0"
              step="0.01"
              required
              value={String(value.amount)}
              onChange={(e) => setForm({ ...value, amount: e.target.value as unknown as number })}
            />
            <TextField
              label="Currency"
              maxLength={3}
              value={value.currency}
              onChange={set("currency")}
            />
          </div>
          <TextField
            label="Due date"
            type="date"
            required
            value={value.dueDate}
            onChange={set("dueDate")}
          />
          <TextField
            label="Notes"
            value={value.notes}
            onChange={set("notes")}
            help="Optional. Shown to the firm's partners."
          />
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={value.advance}
              onCheckedChange={(c) => setForm({ ...value, advance: c === true })}
              className="mt-0.5"
            />
            <span>
              Move the next billing date to {shortDate(value.periodEnd || null)}
              <span className="block text-xs text-muted-foreground">
                So the firm shows as billed up to the end of this period.
              </span>
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create invoice"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({
  invoice,
  onClose,
}: {
  invoice: PlatformInvoice | null;
  onClose: () => void;
}) {
  const refresh = useRefreshPlatform();
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState(PAYMENT_METHODS[0]!);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  if (!invoice) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await recordPlatformPayment({ data: { invoiceId: invoice!.id, paidOn, method, reference } });
      toast.success(`${invoice!.invoice_number} marked as paid`);
      refresh();
      setReference("");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't record the payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Record payment</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {invoice.invoice_number} · {money(invoice.amount, invoice.currency)}
        </p>
        <form onSubmit={submit} className="space-y-4">
          <TextField
            label="Paid on"
            type="date"
            required
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
          />
          <SelectField
            label="Method"
            value={method}
            onChange={setMethod}
            options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
          />
          <TextField
            label="Reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            help="Optional, e.g. the bank or EcoCash transaction number."
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Mark as paid"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function InvoiceTable({
  invoices,
  firmName,
  empty,
}: {
  invoices: PlatformInvoice[];
  /** When set, each row links to its firm. */
  firmName?: (firmId: string) => string;
  empty: string;
}) {
  const refresh = useRefreshPlatform();
  const confirm = useConfirm();
  const [paying, setPaying] = useState<PlatformInvoice | null>(null);

  async function voidIt(inv: PlatformInvoice) {
    if (
      !(await confirm({
        title: `Void ${inv.invoice_number}?`,
        body: "The firm no longer owes it. This can't be undone; make a new invoice if you need to bill again.",
        action: "Void invoice",
        destructive: true,
      }))
    )
      return;
    try {
      await voidPlatformInvoice({ data: { invoiceId: inv.id } });
      toast.success(`${inv.invoice_number} voided`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't void the invoice");
    }
  }

  if (!invoices.length) return <p className="py-6 text-sm text-muted-foreground">{empty}</p>;
  return (
    <>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              {firmName && <TableHead>Firm</TableHead>}
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell>
                  <div className="tabular font-medium">{inv.invoice_number}</div>
                  <div className="text-xs text-muted-foreground">{inv.description}</div>
                </TableCell>
                {firmName && (
                  <TableCell>
                    <Link
                      to="/platform/firms/$id"
                      params={{ id: inv.firm_id }}
                      className="font-medium hover:underline"
                    >
                      {firmName(inv.firm_id)}
                    </Link>
                  </TableCell>
                )}
                <TableCell className="whitespace-nowrap text-xs">
                  {inv.period_start
                    ? `${shortDate(inv.period_start)} – ${shortDate(inv.period_end)}`
                    : "—"}
                </TableCell>
                <TableCell className="tabular text-right">
                  {money(inv.amount, inv.currency)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {shortDate(inv.due_date)}
                </TableCell>
                <TableCell>
                  <InvoiceStatusBadge invoice={inv} />
                  {inv.status === "paid" && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {shortDate(inv.paid_on)} · {inv.payment_method}
                      {inv.payment_reference ? ` · ${inv.payment_reference}` : ""}
                    </div>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  {inv.status === "due" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setPaying(inv)}>
                        Record payment
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => voidIt(inv)}>
                        Void
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <PaymentDialog invoice={paying} onClose={() => setPaying(null)} />
    </>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold">{value}</p>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
