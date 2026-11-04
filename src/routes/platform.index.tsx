import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader, EmptyState } from "@/components/app-shell";
import {
  FirmStatusBadge,
  LinkBox,
  SelectField,
  Stat,
  TextField,
  shortDate,
  usePlatformData,
  useRefreshPlatform,
} from "@/components/platform-ui";
import { money } from "@/lib/firm";
import { createFirm, type FirmRow, type Plan } from "@/lib/platform.functions";
import {
  FIRM_STATUS_LABEL,
  addDays,
  planPrice,
  platformTotals,
  slugFrom,
  today,
} from "@/lib/platform";

export const Route = createFileRoute("/platform/")({
  component: PlatformHome,
});

function PlatformHome() {
  const { data, isPending, isError, refetch } = usePlatformData();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [creating, setCreating] = useState(false);

  const firms = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.firms ?? []).filter(
      (f) =>
        (status === "all" ||
          (status === "attention"
            ? f.status === "past_due" || f.overdue > 0
            : f.status === status)) &&
        (!term ||
          [f.name, f.slug, f.owner_email ?? ""].some((v) => v.toLowerCase().includes(term))),
    );
  }, [data, q, status]);

  if (isPending) return <p className="text-sm text-muted-foreground">Loading firms…</p>;
  if (isError || !data)
    return (
      <div role="alert" className="flex items-center gap-3">
        <p className="text-sm text-destructive">The platform data couldn't be loaded.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );

  const t = platformTotals(data.firms, data.invoices);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Revixions"
        title="Firms"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New firm
          </Button>
        }
      />

      <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Paying firms" value={String(t.payingFirms)} note={`${t.trials} on trial`} />
        <Stat
          label="Monthly recurring revenue"
          value={money(t.mrr, t.currency)}
          note="Annual plans counted per month"
        />
        <Stat
          label="Waiting to be paid"
          value={money(t.amountDue, t.currency)}
          note={`${t.overdueInvoices} invoice${t.overdueInvoices === 1 ? "" : "s"} overdue`}
        />
        <Stat
          label="Need attention"
          value={String(t.needsAttention)}
          note="Overdue, or trial ending within a week"
        />
      </section>

      <section aria-labelledby="firms-heading" className="space-y-3">
        <h2 id="firms-heading" className="sr-only">
          All firms
        </h2>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by firm, web address or owner email"
              aria-label="Search firms"
              className="pl-8"
            />
          </div>
          <div className="w-48">
            <SelectField
              label="Show"
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "All firms" },
                { value: "attention", label: "Overdue" },
                ...Object.entries(FIRM_STATUS_LABEL).map(([value, label]) => ({ value, label })),
              ]}
            />
          </div>
        </div>

        {!data.firms.length ? (
          <EmptyState
            title="No firms yet"
            body="Create a firm and invite its managing partner. They'll set up the firm's details when they accept."
            action={<Button onClick={() => setCreating(true)}>New firm</Button>}
          />
        ) : !firms.length ? (
          <p className="py-6 text-sm text-muted-foreground">No firms match.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Firm</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">People</TableHead>
                  <TableHead>Next bill</TableHead>
                  <TableHead className="text-right">Owed</TableHead>
                  <TableHead>Last active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {firms.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <Link
                        to="/platform/firms/$id"
                        params={{ id: f.id }}
                        className="font-medium hover:underline"
                      >
                        {f.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {f.owner_email ?? "No partner yet"}
                      </div>
                    </TableCell>
                    <TableCell>
                      {f.plan_name ?? "—"}
                      <div className="text-xs text-muted-foreground">
                        {money(f.price, f.currency)} /{" "}
                        {f.billing_cycle === "annual" ? "year" : "month"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <FirmStatusBadge status={f.status} />
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {f.seats_used}
                      {f.user_limit ? ` / ${f.user_limit}` : ""}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {f.status === "trial" && f.trial_ends_at
                        ? `Trial ends ${shortDate(f.trial_ends_at)}`
                        : shortDate(f.next_billing_date)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      <span className={f.overdue ? "font-medium text-destructive" : ""}>
                        {f.amount_due ? money(f.amount_due, f.currency) : "—"}
                      </span>
                      {f.overdue > 0 && (
                        <div className="text-[11px] text-destructive">{f.overdue} overdue</div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {f.last_active
                        ? formatDistanceToNow(new Date(f.last_active), { addSuffix: true })
                        : "Not yet"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <NewFirmDialog open={creating} onOpenChange={setCreating} plans={data.plans} />
    </div>
  );
}

function NewFirmDialog({
  open,
  onOpenChange,
  plans,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  plans: Plan[];
}) {
  const refresh = useRefreshPlatform();
  const navigate = useNavigate();
  const active = plans.filter((p) => p.active);
  const blank = {
    name: "",
    slug: "",
    planId: active[0]?.id ?? "",
    billingCycle: "monthly" as FirmRow["billing_cycle"],
    trialDays: "14",
    billingEmail: "",
    ownerName: "",
    ownerEmail: "",
  };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ firmId: string; message: string; link?: string } | null>(
    null,
  );
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });
  const plan = active.find((p) => p.id === f.planId);
  const days = Number(f.trialDays) || 0;

  function close(o: boolean) {
    if (!o) {
      setF(blank);
      setResult(null);
    }
    onOpenChange(o);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await createFirm({
        data: {
          name: f.name,
          slug: f.slug,
          planId: f.planId || null,
          billingCycle: f.billingCycle,
          trialDays: Math.max(0, Math.min(365, Math.round(days))),
          billingEmail: f.billingEmail,
          ownerName: f.ownerName,
          ownerEmail: f.ownerEmail,
        },
      });
      refresh();
      if (r.outcome === "emailed" || r.outcome === "assigned") {
        toast.success(`${f.name} created. ${r.message}`);
        close(false);
        navigate({ to: "/platform/firms/$id", params: { id: r.firmId } });
      } else setResult(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the firm");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">New firm</DialogTitle>
        </DialogHeader>
        {result ? (
          <div className="space-y-4 text-sm">
            <p role="status">{result.message}</p>
            {result.link && <LinkBox link={result.link} />}
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  close(false);
                  navigate({ to: "/platform/firms/$id", params: { id: result.firmId } });
                }}
              >
                Open the firm
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <TextField
              label="Firm name"
              required
              minLength={2}
              maxLength={120}
              value={f.name}
              onChange={set("name")}
            />
            <TextField
              label="Web address"
              value={f.slug}
              onChange={set("slug")}
              placeholder={slugFrom(f.name) || "moyo-partners"}
              pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]"
              help="Used in the firm's client intake link. Leave blank to make one from the name."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Plan"
                value={f.planId}
                onChange={(v) => setF({ ...f, planId: v })}
                options={active.map((p) => ({
                  value: p.id,
                  label: `${p.name}${p.user_limit ? ` · up to ${p.user_limit}` : ""}`,
                }))}
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
            </div>
            <p className="text-xs text-muted-foreground">
              {plan
                ? `${money(planPrice(plan, f.billingCycle), plan.currency)} per ${f.billingCycle === "annual" ? "year" : "month"}. `
                : ""}
              {days > 0
                ? `Free trial until ${shortDate(addDays(today(), days))}; first bill then.`
                : "No trial: billing starts today."}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Trial (days)"
                type="number"
                min="0"
                max="365"
                value={f.trialDays}
                onChange={set("trialDays")}
              />
              <TextField
                label="Billing email"
                type="email"
                value={f.billingEmail}
                onChange={set("billingEmail")}
                help="Optional."
              />
            </div>
            <fieldset className="space-y-4 rounded-md border p-4">
              <legend className="px-1 text-sm font-medium">Managing partner</legend>
              <TextField
                label="Name"
                required
                minLength={2}
                value={f.ownerName}
                onChange={set("ownerName")}
              />
              <TextField
                label="Email"
                type="email"
                required
                value={f.ownerEmail}
                onChange={set("ownerEmail")}
                help="They get an invitation to set a password and the firm's details."
              />
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create and invite"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
