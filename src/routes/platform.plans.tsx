import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TextField, usePlatformData, useRefreshPlatform } from "@/components/platform-ui";
import { money } from "@/lib/firm";
import { savePlan, type Plan } from "@/lib/platform.functions";

export const Route = createFileRoute("/platform/plans")({
  component: PlatformPlans,
});

function PlatformPlans() {
  const { data, isPending } = usePlatformData();
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  if (isPending || !data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const firmsOn = (id: string) => data.firms.filter((f) => f.plan_id === id).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Revixions"
        title="Plans"
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="mr-1.5 h-4 w-4" />
            New plan
          </Button>
        }
      />
      <p className="max-w-2xl text-sm text-muted-foreground">
        A firm pays its plan's price unless you give it a custom one. Changing a price here applies
        to the next invoice you create; invoices already issued keep their amounts. The user limit
        counts everyone with access plus open invitations.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.plans.map((p) => (
          <article key={p.id} className="flex flex-col rounded-lg border bg-card p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{p.name}</h2>
              {!p.active && <Badge variant="closed">Not offered</Badge>}
            </div>
            {p.description && <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>}
            <p className="tabular mt-4 text-2xl font-semibold">
              {money(p.monthly_price, p.currency)}
              <span className="text-sm font-normal text-muted-foreground"> / month</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {p.annual_price != null
                ? `${money(p.annual_price, p.currency)} / year`
                : "No annual price"}
            </p>
            <p className="mt-3 text-sm">
              {p.user_limit ? `Up to ${p.user_limit} people` : "No user limit"}
            </p>
            <p className="text-xs text-muted-foreground">
              {firmsOn(p.id)} firm{firmsOn(p.id) === 1 ? "" : "s"}
            </p>
            <div className="mt-4">
              <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                Edit
              </Button>
            </div>
          </article>
        ))}
      </div>
      {editing && (
        <PlanDialog plan={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function PlanDialog({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const refresh = useRefreshPlatform();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    monthly: plan ? String(plan.monthly_price) : "",
    annual: plan?.annual_price != null ? String(plan.annual_price) : "",
    currency: plan?.currency ?? "USD",
    limit: plan?.user_limit != null ? String(plan.user_limit) : "",
    sort: String(plan?.sort_order ?? 0),
    active: plan?.active ?? true,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const monthly = Number(f.monthly);
    const annual = f.annual.trim() ? Number(f.annual) : null;
    const limit = f.limit.trim() ? Math.round(Number(f.limit)) : null;
    if (
      !(monthly >= 0) ||
      (annual !== null && !(annual >= 0)) ||
      (limit !== null && !(limit >= 1))
    ) {
      toast.error("Check the prices and user limit");
      return;
    }
    setBusy(true);
    try {
      await savePlan({
        data: {
          id: plan?.id ?? null,
          name: f.name,
          description: f.description,
          monthlyPrice: monthly,
          annualPrice: annual,
          currency: f.currency,
          userLimit: limit,
          active: f.active,
          sortOrder: Math.max(0, Math.round(Number(f.sort) || 0)),
        },
      });
      toast.success("Plan saved");
      refresh();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {plan ? `Edit ${plan.name}` : "New plan"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <TextField
            label="Name"
            required
            minLength={2}
            maxLength={60}
            value={f.name}
            onChange={set("name")}
          />
          <TextField
            label="Description"
            maxLength={300}
            value={f.description}
            onChange={set("description")}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label="Monthly price"
              type="number"
              min="0"
              step="0.01"
              required
              value={f.monthly}
              onChange={set("monthly")}
            />
            <TextField
              label="Annual price"
              type="number"
              min="0"
              step="0.01"
              value={f.annual}
              onChange={set("annual")}
              help="Optional."
            />
            <TextField
              label="Currency"
              maxLength={3}
              required
              value={f.currency}
              onChange={set("currency")}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="User limit"
              type="number"
              min="1"
              value={f.limit}
              onChange={set("limit")}
              help="Blank for no limit."
            />
            <TextField
              label="Order"
              type="number"
              min="0"
              value={f.sort}
              onChange={set("sort")}
              help="Lower numbers come first."
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={f.active}
              onChange={(e) => setF({ ...f, active: e.target.checked })}
              className="h-4 w-4 accent-primary"
            />
            Offer this plan to new firms
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save plan"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
