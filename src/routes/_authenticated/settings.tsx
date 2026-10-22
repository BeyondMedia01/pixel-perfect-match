import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe, isPartner } from "@/lib/auth";
import { ROLE_LABELS, type AppRole } from "@/lib/legal";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Docket" }, { name: "description", content: "Your profile and firm settings." }] }),
  component: Settings,
});

function Settings() {
  const { data: me } = useMe();
  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <PageHeader title="Settings" />
      <ProfileSection />
      {isPartner(me?.role) && <TeamSection currentUserId={me!.user.id} />}
      {isPartner(me?.role) && <EthicalWallsSection />}
    </div>
  );
}

function ProfileSection() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const value = name ?? me.profile?.full_name ?? "";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ full_name: value }).eq("id", me!.user.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Profile saved"); qc.invalidateQueries({ queryKey: ["me"] }); }
  }

  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="eyebrow mb-4">Your profile</h2>
      <form onSubmit={save} className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs space-y-1.5">
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" value={value} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <p className="flex h-9 items-center text-sm text-muted-foreground">{me.user.email}</p>
        </div>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </form>
    </section>
  );
}

const ROLES: AppRole[] = ["partner", "lawyer", "paralegal", "frontdesk", "client"];

function TeamSection({ currentUserId }: { currentUserId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, created_at").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const rolesByUser = new Map((r.data ?? []).map((x) => [x.user_id, x.role as AppRole]));
      return (p.data ?? []).map((u) => ({ ...u, role: rolesByUser.get(u.id) ?? ("paralegal" as AppRole) }));
    },
  });

  async function setRole(userId: string, role: AppRole) {
    const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (delErr) { toast.error(delErr.message); return; }
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) toast.error(error.message);
    else { toast.success("Role updated"); qc.invalidateQueries({ queryKey: ["team"] }); }
  }

  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="eyebrow mb-1">Team &amp; roles</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Roles control what each person can see and do. To add someone new, ask them to sign up — they appear here automatically.
      </p>
      <ul className="divide-y">
        {data?.map((u) => {
          const isSelf = u.id === currentUserId;
          return (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{u.full_name || u.email}{isSelf && <span className="text-muted-foreground"> (you)</span>}</div>
                <div className="truncate text-xs text-muted-foreground">{u.email}</div>
              </div>
              {isSelf ? (
                <Badge variant="quiet">{ROLE_LABELS[u.role]}</Badge>
              ) : (
                <Select value={u.role} onValueChange={(v) => setRole(u.id, v as AppRole)}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
