import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/confirm";
import {
  FirmStatusBadge,
  InvoiceTable,
  LinkBox,
  NewInvoiceDialog,
  SelectField,
  TextField,
  shortDate,
  usePlatformData,
  useRefreshPlatform,
} from "@/components/platform-ui";
import { money } from "@/lib/firm";
import { ROLE_LABELS, type AppRole } from "@/lib/legal";
import {
  getPlatformFirmPeople,
  invitePlatformOwner,
  platformInvitationLink,
  setFirmStatus,
  updateFirm,
  type FirmRow,
  type Plan,
} from "@/lib/platform.functions";
import { FIRM_STATUS_LABEL, planPrice } from "@/lib/platform";

export const Route = createFileRoute("/platform/firms/$id")({
  component: FirmPage,
});

function FirmPage() {
  const { id } = Route.useParams();
  const { data, isPending } = usePlatformData();
  const refresh = useRefreshPlatform();
  const confirm = useConfirm();
  const [billing, setBilling] = useState(false);
  const firm = data?.firms.find((f) => f.id === id);

  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!firm || !data)
    return (
      <div className="space-y-3">
        <p className="text-sm">That firm wasn't found.</p>
        <Button asChild variant="outline">
          <Link to="/platform">Back to firms</Link>
        </Button>
      </div>
    );

  const open = firm.status !== "suspended" && firm.status !== "cancelled";
  async function toggleAccess() {
    const ok = await confirm(
      open
        ? {
            title: `Suspend ${firm!.name}?`,
            body: "Everyone at the firm loses access to its data straight away. Nothing is deleted, and partners can still see what they owe. You can restore access at any time.",
            action: "Suspend access",
            destructive: true,
          }
        : {
            title: `Restore access for ${firm!.name}?`,
            body: "The firm can use Acta again straight away.",
            action: "Restore access",
          },
    );
    if (!ok) return;
    try {
      await setFirmStatus({ data: { id: firm!.id, status: open ? "suspended" : "active" } });
      toast.success(open ? "Access suspended" : "Access restored");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't change access");
    }
  }

  const invoices = data.invoices.filter((i) => i.firm_id === firm.id);
  const intake = `${typeof window === "undefined" ? "" : window.location.origin}/intake?firm=${firm.slug}`;

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/platform"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Firms
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="page-title flex flex-wrap items-center gap-3">
              {firm.name} <FirmStatusBadge status={firm.status} />
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {firm.plan_name ?? "No plan"} · {money(firm.price, firm.currency)} per{" "}
              {firm.billing_cycle === "annual" ? "year" : "month"} · {firm.seats_used}
              {firm.user_limit ? ` of ${firm.user_limit}` : ""} people · {firm.matters} matters ·
              since {shortDate(firm.created_at)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={toggleAccess}>
              {open ? "Suspend access" : "Restore access"}
            </Button>
            <Button onClick={() => setBilling(true)}>New invoice</Button>
          </div>
        </div>
      </div>

      <section aria-labelledby="invoices-heading" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="invoices-heading" className="text-lg font-semibold">
            Invoices
          </h2>
          {firm.amount_due > 0 && (
            <p className={`text-sm ${firm.overdue ? "text-destructive" : "text-muted-foreground"}`}>
              {money(firm.amount_due, firm.currency)} waiting to be paid
            </p>
          )}
        </div>
        <InvoiceTable invoices={invoices} empty="No invoices yet." />
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <SubscriptionForm
          key={firm.id + firm.status + firm.next_billing_date}
          firm={firm}
          plans={data.plans}
        />
        <div className="space-y-8">
          <People firm={firm} />
          <section aria-labelledby="links-heading" className="space-y-2">
            <h2 id="links-heading" className="text-lg font-semibold">
              Client intake link
            </h2>
            <p className="text-xs text-muted-foreground">
              Where the firm's prospective clients send inquiries.
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded border bg-muted px-2 py-1.5 text-xs">
                {intake}
              </code>
              <Button
                variant="outline"
                size="icon"
                aria-label="Copy intake link"
                onClick={() =>
                  navigator.clipboard.writeText(intake).then(() => toast.success("Link copied"))
                }
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </section>
        </div>
      </div>

      <NewInvoiceDialog firm={firm} open={billing} onOpenChange={setBilling} />
    </div>
  );
}

function SubscriptionForm({ firm, plans }: { firm: FirmRow; plans: Plan[] }) {
  const refresh = useRefreshPlatform();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    name: firm.name,
    slug: firm.slug,
    status: firm.status,
    planId: firm.plan_id ?? "",
    billingCycle: firm.billing_cycle,
    customPrice: "",
    trialEndsAt: firm.trial_ends_at ?? "",
    nextBillingDate: firm.next_billing_date ?? "",
    billingEmail: firm.billing_email ?? "",
    notes: firm.notes ?? "",
  });
  const set =
    (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF({ ...f, [k]: e.target.value });
  const plan = plans.find((p) => p.id === f.planId);
  const listPrice = planPrice(plan, f.billingCycle);
  const custom =
    firm.price != null &&
    planPrice(
      plans.find((p) => p.id === firm.plan_id),
      firm.billing_cycle,
    ) !== firm.price;
  const [useCustom, setUseCustom] = useState(custom);
  const [customValue, setCustomValue] = useState(custom ? String(firm.price) : "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const price = useCustom ? Number(customValue) : null;
    if (useCustom && !(price! >= 0)) {
      toast.error("Enter a custom price of 0 or more");
      return;
    }
    setBusy(true);
    try {
      await updateFirm({
        data: {
          id: firm.id,
          name: f.name,
          slug: f.slug,
          status: f.status,
          planId: f.planId || null,
          billingCycle: f.billingCycle,
          customPrice: price,
          trialEndsAt: f.trialEndsAt || null,
          nextBillingDate: f.nextBillingDate || null,
          billingEmail: f.billingEmail,
          notes: f.notes,
        },
      });
      toast.success("Firm saved");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the firm");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="sub-heading">
      <h2 id="sub-heading" className="mb-3 text-lg font-semibold">
        Firm and subscription
      </h2>
      <form onSubmit={save} className="space-y-4 rounded-lg border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" required value={f.name} onChange={set("name")} />
          <TextField
            label="Web address"
            required
            value={f.slug}
            onChange={set("slug")}
            pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]"
            help="Changing it breaks intake links already shared."
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label="Plan"
            value={f.planId}
            onChange={(v) => setF({ ...f, planId: v })}
            options={plans
              .filter((p) => p.active || p.id === firm.plan_id)
              .map((p) => ({ value: p.id, label: p.name }))}
          />
          <SelectField
            label="Billing"
            value={f.billingCycle}
            onChange={(v) => setF({ ...f, billingCycle: v as FirmRow["billing_cycle"] })}
            options={[
              { value: "monthly", label: "Monthly" },
              { value: "annual", label: "Annual" },
            ]}
          />
          <SelectField
            label="Status"
            value={f.status}
            onChange={(v) => setF({ ...f, status: v as FirmRow["status"] })}
            options={Object.entries(FIRM_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
          />
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useCustom}
              onChange={(e) => setUseCustom(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Custom price instead of the plan's {money(listPrice, plan?.currency)}
          </label>
          {useCustom && (
            <TextField
              label={`Custom price per ${f.billingCycle === "annual" ? "year" : "month"}`}
              type="number"
              min="0"
              step="0.01"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
            />
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Trial ends"
            type="date"
            value={f.trialEndsAt}
            onChange={set("trialEndsAt")}
          />
          <TextField
            label="Next billing date"
            type="date"
            value={f.nextBillingDate}
            onChange={set("nextBillingDate")}
          />
        </div>
        <TextField
          label="Billing email"
          type="email"
          value={f.billingEmail}
          onChange={set("billingEmail")}
        />
        <div className="space-y-1.5">
          <Label htmlFor="firm-notes">Notes</Label>
          <Textarea
            id="firm-notes"
            rows={3}
            value={f.notes}
            onChange={set("notes")}
            placeholder="Only Revixions sees these."
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Suspended and cancelled firms can't open any of their data. Overdue firms keep access and
          go back to active when their overdue invoices are paid.
        </p>
        <div className="flex justify-end">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function People({ firm }: { firm: FirmRow }) {
  const qc = useQueryClient();
  const [inviting, setInviting] = useState(false);
  const people = useQuery({
    queryKey: ["platform-people", firm.id],
    queryFn: () => getPlatformFirmPeople({ data: { firmId: firm.id } }),
  });

  async function copyLink(email: string) {
    try {
      const r = await platformInvitationLink({ data: { email } });
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      await navigator.clipboard.writeText(r.link);
      toast.success("Invitation link copied", {
        description: "It signs them in, so send it only to them.",
      });
    } catch {
      toast.error("Couldn't copy an invitation link. Try again.");
    }
  }

  return (
    <section aria-labelledby="people-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="people-heading" className="text-lg font-semibold">
          People
        </h2>
        <Button size="sm" variant="outline" onClick={() => setInviting(true)}>
          Invite a partner
        </Button>
      </div>
      {people.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card text-sm">
          {people.data?.people.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.full_name || p.email}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {p.email}
                  {!p.onboarded_at && " · hasn't joined yet"}
                </div>
              </div>
              <Badge variant="quiet">{p.role ? ROLE_LABELS[p.role as AppRole] : "No access"}</Badge>
              {!p.onboarded_at && p.email && (
                <Button size="sm" variant="ghost" onClick={() => copyLink(p.email!)}>
                  Copy link
                </Button>
              )}
            </li>
          ))}
          {people.data?.invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{i.full_name || i.email}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {i.email} · invited {shortDate(i.created_at)}
                </div>
              </div>
              <Badge variant="quiet">{ROLE_LABELS[i.role as AppRole]}</Badge>
              <Button size="sm" variant="ghost" onClick={() => copyLink(i.email)}>
                Copy link
              </Button>
            </li>
          ))}
          {!people.data?.people.length && !people.data?.invites.length && (
            <li className="px-4 py-3 text-muted-foreground">
              Nobody yet. Invite the managing partner.
            </li>
          )}
        </ul>
      )}
      <InvitePartnerDialog
        firm={firm}
        open={inviting}
        onOpenChange={setInviting}
        onDone={() => qc.invalidateQueries({ queryKey: ["platform-people", firm.id] })}
      />
    </section>
  );
}

function InvitePartnerDialog({
  firm,
  open,
  onOpenChange,
  onDone,
}: {
  firm: FirmRow;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const refresh = useRefreshPlatform();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ message: string; link?: string } | null>(null);
  function close(o: boolean) {
    if (!o) {
      setName("");
      setEmail("");
      setResult(null);
    }
    onOpenChange(o);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await invitePlatformOwner({ data: { firmId: firm.id, email, fullName: name } });
      onDone();
      refresh();
      if (r.link) setResult(r);
      else {
        toast.success(r.message);
        close(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the invitation");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            Invite a partner to {firm.name}
          </DialogTitle>
        </DialogHeader>
        {result ? (
          <div className="space-y-4 text-sm">
            <p role="status">{result.message}</p>
            {result.link && <LinkBox link={result.link} />}
            <div className="flex justify-end">
              <Button onClick={() => close(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <TextField
              label="Name"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <TextField
              label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              help="Partners can then invite the rest of the team themselves."
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send invitation"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
