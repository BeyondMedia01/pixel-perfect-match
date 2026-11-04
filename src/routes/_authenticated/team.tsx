import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Copy, MoreHorizontal, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, isPartner } from "@/lib/auth";
import { ROLE_LABELS, type AppRole } from "@/lib/legal";
import { inviteTeamMember } from "@/lib/team.functions";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { useConfirm } from "@/components/confirm";
import { Field } from "@/components/matter-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team — Acta" },
      { name: "description", content: "Everyone at the firm, their roles and invitations." },
      { property: "og:title", content: "Team — Acta" },
      { property: "og:description", content: "Everyone at the firm, their roles and invitations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeamPage,
});

/** Roles a partner can give. ("client" has no screens yet, so it isn't offered.) */
const ROLES: AppRole[] = ["partner", "lawyer", "paralegal", "frontdesk"];
const ROLE_HELP: Record<string, string> = {
  partner: "Everything, including settings, billing and ethical walls.",
  lawyer: "Their matters, clients, billing and deadline confirmation.",
  paralegal: "Their matters, tasks, documents and time.",
  frontdesk: "Inquiries, consultations and matter names only.",
};

function signUpLink(email: string) {
  return `${window.location.origin}/auth?mode=signup&email=${encodeURIComponent(email)}`;
}

function TeamPage() {
  const { data: me } = useMe();
  const partner = isPartner(me?.role);
  const qc = useQueryClient();
  const confirm = useConfirm();

  const { data: members } = useQuery({
    queryKey: ["team"],
    enabled: !!me,
    queryFn: async () => {
      const [p, r, rates] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, created_at").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("billing_rates").select("user_id, hourly_rate"),
      ]);
      const rolesByUser = new Map((r.data ?? []).map((x) => [x.user_id, x.role as AppRole]));
      const rateByUser = new Map((rates.data ?? []).map((x) => [x.user_id, x.hourly_rate]));
      // People with no role are waiting for approval; list them first.
      return (p.data ?? [])
        .map((u) => ({
          ...u,
          role: rolesByUser.get(u.id) ?? null,
          rate: rateByUser.get(u.id) ?? null,
        }))
        .sort((a, b) => Number(a.role !== null) - Number(b.role !== null));
    },
  });

  const { data: invites } = useQuery({
    queryKey: ["team-invitations"],
    enabled: partner,
    queryFn: async () =>
      (
        await supabase
          .from("team_invitations")
          .select("*")
          .is("accepted_at", null)
          .is("revoked_at", null)
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["team"] });
    qc.invalidateQueries({ queryKey: ["team-invitations"] });
  };
  const nameOf = (u: { full_name: string; email: string | null }) =>
    u.full_name || u.email || "this person";

  async function setRole(u: NonNullable<typeof members>[number], role: AppRole) {
    const ok = await confirm({
      title: u.role
        ? `Change ${nameOf(u)}'s role to ${ROLE_LABELS[role]}?`
        : `Approve ${nameOf(u)} as ${ROLE_LABELS[role]}?`,
      body: u.role
        ? `They'll lose ${ROLE_LABELS[u.role]} access straight away.`
        : `${ROLE_HELP[role]} They get access as soon as you confirm.`,
      action: u.role ? "Change role" : "Approve",
    });
    if (!ok) return;
    const { error } = await supabase.rpc("set_user_role", { _user_id: u.id, _role: role });
    if (error) toast.error(error.message);
    else {
      toast.success("Role updated");
      refresh();
    }
  }

  async function removeAccess(u: NonNullable<typeof members>[number]) {
    const ok = await confirm({
      title: `Remove ${nameOf(u)} from the team?`,
      body: "They'll stop seeing any firm data straight away. Their account and work history stay, and you can give them a role again later.",
      action: "Remove access",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("remove_team_member", { _user_id: u.id });
    if (error) toast.error(error.message);
    else {
      toast.success(`${nameOf(u)} no longer has access`);
      refresh();
    }
  }

  async function setRate(userId: string, value: string) {
    const hourly_rate = parseFloat(value);
    if (!(hourly_rate >= 0)) {
      toast.error("Enter a rate of 0 or more");
      return;
    }
    const { error } = await supabase
      .from("billing_rates")
      .upsert({ user_id: userId, hourly_rate, updated_at: new Date().toISOString() });
    if (error) toast.error(error.message);
    else {
      toast.success("Rate saved");
      refresh();
    }
  }

  async function revoke(id: string, email: string) {
    if (
      !(await confirm({
        title: `Cancel the invitation for ${email}?`,
        body: "If they sign up later, they'll wait for approval like anyone else.",
        action: "Cancel invitation",
        destructive: true,
      }))
    )
      return;
    const { error } = await supabase
      .from("team_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Invitation cancelled");
      refresh();
    }
  }

  async function copyLink(email: string) {
    try {
      await navigator.clipboard.writeText(signUpLink(email));
      toast.success("Sign-up link copied");
    } catch {
      toast.error("Couldn't copy. The link is: " + signUpLink(email));
    }
  }

  const waiting = (members ?? []).filter((u) => !u.role);
  const active = (members ?? []).filter((u) => u.role);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader title="Team" actions={partner ? <InviteDialog onDone={refresh} /> : undefined} />

      {partner && waiting.length > 0 && (
        <section>
          <h2 className="eyebrow mb-3">Waiting for approval ({waiting.length})</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {waiting.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{nameOf(u)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {u.email} · signed up {format(new Date(u.created_at), "d MMM yyyy")}
                  </div>
                </div>
                <Badge variant="hold">Awaiting approval</Badge>
                <Select onValueChange={(v) => setRole(u, v as AppRole)}>
                  <SelectTrigger className="w-44" aria-label={`Approve ${nameOf(u)} as`}>
                    <SelectValue placeholder="Approve as…" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        </section>
      )}

      {partner && !!invites?.length && (
        <section>
          <h2 className="eyebrow mb-3">Invited ({invites.length})</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{i.full_name || i.email}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {i.email} · invited {format(new Date(i.created_at), "d MMM yyyy")}
                  </div>
                </div>
                <Badge variant="quiet">{ROLE_LABELS[i.role]}</Badge>
                <Button variant="outline" size="sm" onClick={() => copyLink(i.email)}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copy sign-up link
                </Button>
                <Button variant="ghost" size="sm" onClick={() => revoke(i.id, i.email)}>
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="eyebrow mb-3">Members ({active.length})</h2>
        {!active.length ? (
          <EmptyState title="No team members yet" body="Invite colleagues to give them access." />
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {active.map((u) => {
              const isSelf = u.id === me?.user.id;
              return (
                <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {nameOf(u)}
                      {isSelf && <span className="text-muted-foreground"> (you)</span>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                  </div>
                  {partner && u.role !== "frontdesk" && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      Rate
                      <Input
                        key={`${u.id}-${u.rate ?? "none"}`}
                        type="number"
                        min="0"
                        step="10"
                        defaultValue={u.rate ?? ""}
                        placeholder="250"
                        aria-label={`Hourly rate for ${nameOf(u)}`}
                        className="h-8 w-20"
                        onBlur={(e) => {
                          if (e.target.value !== String(u.rate ?? ""))
                            setRate(u.id, e.target.value);
                        }}
                      />
                    </label>
                  )}
                  {partner && !isSelf ? (
                    <>
                      <Select value={u.role!} onValueChange={(v) => setRole(u, v as AppRole)}>
                        <SelectTrigger className="h-8 w-36" aria-label={`Role for ${nameOf(u)}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`More options for ${nameOf(u)}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive"
                            onSelect={() => removeAccess(u)}
                          >
                            Remove from team
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  ) : (
                    <Badge variant="quiet">{ROLE_LABELS[u.role!]}</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {partner && (
          <p className="mt-3 text-xs text-muted-foreground">
            Hourly rates apply to new time entries. Anyone without a rate is billed at 250 per hour.
          </p>
        )}
      </section>
    </div>
  );
}

function InviteDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ email: "", fullName: "", role: "lawyer" as AppRole });
  const [result, setResult] = useState<{ email: string; message: string; emailed: boolean } | null>(
    null,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await inviteTeamMember({
        data: {
          email: f.email,
          fullName: f.fullName,
          role: f.role as "partner" | "lawyer" | "paralegal" | "frontdesk",
        },
      });
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      onDone();
      if (r.outcome === "assigned") {
        toast.success(r.message);
        setOpen(false);
        return;
      }
      setResult({
        email: f.email.trim().toLowerCase(),
        message: r.message,
        emailed: r.outcome === "emailed",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the invitation");
    } finally {
      setBusy(false);
    }
  }

  function reset(o: boolean) {
    setOpen(o);
    if (!o) {
      setResult(null);
      setF({ email: "", fullName: "", role: "lawyer" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-1.5 h-4 w-4" />
          Invite member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Invite a team member</DialogTitle>
        </DialogHeader>
        {result ? (
          <div className="space-y-4 text-sm">
            <p>{result.message}</p>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                {result.emailed ? "You can also send them this link yourself:" : "Sign-up link:"}
              </p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={signUpLink(result.email)}
                  onFocus={(e) => e.target.select()}
                  aria-label="Sign-up link"
                />
                <Button
                  variant="outline"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(signUpLink(result.email))
                      .then(() => toast.success("Copied"))
                  }
                >
                  Copy
                </Button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => reset(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email">
              <Input
                type="email"
                required
                value={f.email}
                onChange={(e) => setF((p) => ({ ...p, email: e.target.value }))}
                placeholder="name@firm.co.zw"
              />
            </Field>
            <Field label="Full name (optional)">
              <Input
                value={f.fullName}
                onChange={(e) => setF((p) => ({ ...p, fullName: e.target.value }))}
              />
            </Field>
            <Field label="Role">
              <Select
                value={f.role}
                onValueChange={(v) => setF((p) => ({ ...p, role: v as AppRole }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">{ROLE_HELP[f.role]}</p>
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => reset(false)}>
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
