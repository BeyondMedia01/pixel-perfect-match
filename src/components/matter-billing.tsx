import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Plus, FilePlus2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useProfiles, isPartner } from "@/lib/auth";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_VARIANTS, fmtMoney, fmtHours, type InvoiceStatus } from "@/lib/billing";
import { EmptyState } from "@/components/app-shell";
import { Field } from "@/components/matter-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type TimeEntry = {
  id: string;
  matter_id: string;
  user_id: string;
  entry_date: string;
  description: string;
  hours: number;
  hourly_rate: number;
  billable: boolean;
  invoice_id: string | null;
};

export type Invoice = {
  id: string;
  invoice_number: string;
  matter_id: string;
  client_id: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  notes: string | null;
};

export function useTimeEntries(matterId?: string) {
  return useQuery({
    queryKey: ["time-entries", matterId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("time_entries").select("*").order("entry_date", { ascending: false });
      if (matterId) q = q.eq("matter_id", matterId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TimeEntry[];
    },
  });
}

export function useInvoices(matterId?: string) {
  return useQuery({
    queryKey: ["invoices", matterId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("invoices")
        .select("*, invoice_items(quantity, unit_price), matters(matter_number, title), clients(name)")
        .order("issue_date", { ascending: false });
      if (matterId) q = q.eq("matter_id", matterId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as (Invoice & {
        invoice_items: { quantity: number; unit_price: number }[];
        matters: { matter_number: string; title: string } | null;
        clients: { name: string } | null;
      })[];
    },
  });
}

export function invoiceTotal(inv: { invoice_items: { quantity: number; unit_price: number }[] }) {
  return inv.invoice_items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
}

function LogTimeDialog({ matterId, onDone }: { matterId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [hours, setHours] = useState("");
  const [rate, setRate] = useState("250");
  const [billable, setBillable] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const h = parseFloat(hours);
    if (!description.trim() || !(h > 0)) { toast.error("Enter a description and hours."); return; }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("time_entries").insert({
      matter_id: matterId,
      user_id: u.user!.id,
      entry_date: date,
      description: description.trim(),
      hours: h,
      hourly_rate: parseFloat(rate) || 0,
      billable,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Time logged");
    setOpen(false);
    setDescription(""); setHours("");
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="mr-1.5 h-4 w-4" />Log time</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Log time</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What work was done?" /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Hours"><Input type="number" min="0.1" step="0.1" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="1.5" /></Field>
            <Field label="Rate / hour"><Input type="number" min="0" step="10" value={rate} onChange={(e) => setRate(e.target.value)} disabled={!billable} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={billable} onCheckedChange={(v) => setBillable(v === true)} /> Billable to the client
          </label>
          <Button onClick={submit} disabled={busy} className="w-full">{busy ? "Saving…" : "Save entry"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewInvoiceDialog({ matterId, clientId, entries, onDone }: { matterId: string; clientId: string; entries: TimeEntry[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(entries.map((e) => e.id)));
  const [due, setDue] = useState(format(new Date(Date.now() + 30 * 864e5), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const chosen = entries.filter((e) => selected.has(e.id));
  const total = chosen.reduce((s, e) => s + e.hours * e.hourly_rate, 0);

  async function submit() {
    if (chosen.length === 0) { toast.error("Select at least one time entry."); return; }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { data: num, error: nErr } = await supabase.rpc("next_invoice_number");
    if (nErr) { setBusy(false); toast.error(nErr.message); return; }
    const { data: inv, error } = await supabase.from("invoices").insert({
      invoice_number: num as string,
      matter_id: matterId,
      client_id: clientId,
      status: "draft",
      due_date: due,
      notes: notes.trim() || null,
      created_by: u.user!.id,
    }).select("id").single();
    if (error || !inv) { setBusy(false); toast.error(error?.message ?? "Could not create invoice"); return; }
    const { error: iErr } = await supabase.from("invoice_items").insert(
      chosen.map((e) => ({ invoice_id: inv.id, description: `${e.description} (${format(new Date(e.entry_date), "d MMM yyyy")})`, quantity: e.hours, unit_price: e.hourly_rate })),
    );
    const { error: tErr } = await supabase.from("time_entries").update({ invoice_id: inv.id }).in("id", chosen.map((e) => e.id));
    setBusy(false);
    if (iErr || tErr) { toast.error((iErr ?? tErr)!.message); return; }
    toast.success(`Invoice ${num} created as draft`);
    setOpen(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><FilePlus2 className="mr-1.5 h-4 w-4" />New invoice</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Invoice unbilled time</DialogTitle></DialogHeader>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {entries.map((e) => (
            <label key={e.id} className="flex items-start gap-3 rounded-md border p-3 text-sm">
              <Checkbox
                checked={selected.has(e.id)}
                onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); v === true ? n.add(e.id) : n.delete(e.id); return n; })}
              />
              <span className="flex-1">{e.description}<span className="block text-xs text-muted-foreground">{format(new Date(e.entry_date), "d MMM yyyy")}</span></span>
              <span className="tabular text-xs">{fmtHours(e.hours)} · {fmtMoney(e.hours * e.hourly_rate)}</span>
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <Field label="Notes (optional)"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <div className="flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">{chosen.length} entries</span>
          <span className="tabular font-semibold">{fmtMoney(total)}</span>
        </div>
        <Button onClick={submit} disabled={busy} className="w-full">{busy ? "Creating…" : "Create draft invoice"}</Button>
      </DialogContent>
    </Dialog>
  );
}

export function InvoiceStatusSelect({ invoice, onDone }: { invoice: Invoice; onDone: () => void }) {
  const { data: me } = useMe();
  if (!isPartner(me?.role)) return <Badge variant={INVOICE_STATUS_VARIANTS[invoice.status]}>{INVOICE_STATUS_LABELS[invoice.status]}</Badge>;
  return (
    <Select value={invoice.status} onValueChange={async (v) => {
      const { error } = await supabase.from("invoices").update({ status: v as InvoiceStatus }).eq("id", invoice.id);
      if (error) toast.error(error.message); else { toast.success(`Marked ${INVOICE_STATUS_LABELS[v as InvoiceStatus].toLowerCase()}`); onDone(); }
    }}>
      <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]).map((s) => <SelectItem key={s} value={s}>{INVOICE_STATUS_LABELS[s]}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function MatterBilling({ matterId, clientId }: { matterId: string; clientId: string }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: profiles } = useProfiles();
  const { data: entries } = useTimeEntries(matterId);
  const { data: invoices } = useInvoices(matterId);
  const partner = isPartner(me?.role);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["time-entries"] }); qc.invalidateQueries({ queryKey: ["invoices"] }); };

  const nameOf = (uid: string) => profiles?.find((p) => p.id === uid)?.full_name ?? "—";
  const unbilled = (entries ?? []).filter((e) => e.billable && !e.invoice_id);
  const unbilledTotal = unbilled.reduce((s, e) => s + e.hours * e.hourly_rate, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Unbilled: <span className="tabular font-semibold text-foreground">{fmtHours(unbilled.reduce((s, e) => s + e.hours, 0))}</span> · <span className="tabular font-semibold text-foreground">{fmtMoney(unbilledTotal)}</span>
        </p>
        <div className="flex gap-2">
          <LogTimeDialog matterId={matterId} onDone={refresh} />
          {partner && unbilled.length > 0 && <NewInvoiceDialog matterId={matterId} clientId={clientId} entries={unbilled} onDone={refresh} />}
        </div>
      </div>

      {(entries ?? []).length === 0 ? (
        <EmptyState title="No time logged yet" body="Use Log time to record work on this matter; billable entries can be invoiced." />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {(entries ?? []).map((e) => (
            <li key={e.id} className="flex items-center gap-4 px-4 py-3 text-sm">
              <span className="flex-1">{e.description}
                <span className="block text-xs text-muted-foreground">{nameOf(e.user_id)} · {format(new Date(e.entry_date), "d MMM yyyy")}</span>
              </span>
              {!e.billable && <Badge variant="quiet">Non-billable</Badge>}
              {e.invoice_id && <Badge variant="closed">Invoiced</Badge>}
              <span className="tabular w-16 text-right text-xs">{fmtHours(e.hours)}</span>
              <span className="tabular w-24 text-right">{e.billable ? fmtMoney(e.hours * e.hourly_rate) : "—"}</span>
              {(e.user_id === me?.user.id || partner) && !e.invoice_id && (
                <Button variant="ghost" size="icon" aria-label="Delete entry" onClick={async () => {
                  const { error } = await supabase.from("time_entries").delete().eq("id", e.id);
                  if (error) toast.error(error.message); else refresh();
                }}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div>
        <h3 className="mb-3 text-lg">Invoices</h3>
        {(invoices ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices for this matter yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {(invoices ?? []).map((inv) => (
              <li key={inv.id} className="flex items-center gap-4 px-4 py-3 text-sm">
                <span className="tabular font-medium">{inv.invoice_number}</span>
                <span className="flex-1 text-xs text-muted-foreground">Issued {format(new Date(inv.issue_date), "d MMM yyyy")} · due {format(new Date(inv.due_date), "d MMM yyyy")}</span>
                <span className="tabular font-semibold">{fmtMoney(invoiceTotal(inv))}</span>
                <InvoiceStatusSelect invoice={inv} onDone={refresh} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
