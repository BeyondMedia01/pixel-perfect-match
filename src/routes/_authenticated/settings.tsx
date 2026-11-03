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
  head: () => ({ meta: [{ title: "Settings — Acta" }, { name: "description", content: "Your profile and firm settings." }, { property: "og:title", content: "Settings — Acta" }, { property: "og:description", content: "Your profile and firm settings." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
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
      // People with no role are waiting for approval; list them first.
      return (p.data ?? [])
        .map((u) => ({ ...u, role: rolesByUser.get(u.id) ?? null }))
        .sort((a, b) => Number(a.role !== null) - Number(b.role !== null));
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
        Roles control what each person can see and do. To add someone new, ask them to sign up. They appear here as
        awaiting approval and can't see any firm data until you give them a role.
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
              {!isSelf && !u.role && <Badge variant="hold">Awaiting approval</Badge>}
              {isSelf ? (
                <Badge variant="quiet">{u.role ? ROLE_LABELS[u.role] : "No role"}</Badge>
              ) : (
                <Select value={u.role ?? undefined} onValueChange={(v) => setRole(u.id, v as AppRole)}>
                  <SelectTrigger className="w-44" aria-label={`Role for ${u.full_name || u.email}`}><SelectValue placeholder="Choose a role" /></SelectTrigger>
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

function EthicalWallsSection() {
  const qc = useQueryClient();
  const [matterId, setMatterId] = useState("");
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const { data } = useQuery({
    queryKey: ["ethical-walls"],
    queryFn: async () => {
      const [walls, matters, profiles] = await Promise.all([
        supabase.from("matter_ethical_walls").select("*, matter:matters(title, matter_number), user:profiles!matter_ethical_walls_user_id_fkey(full_name)").order("created_at", { ascending: false }),
        supabase.from("matters").select("id, title, matter_number").neq("status", "closed").order("matter_number"),
        supabase.from("profiles").select("id, full_name, email").order("full_name"),
      ]);
      return { walls: walls.data ?? [], matters: matters.data ?? [], profiles: profiles.data ?? [] };
    },
  });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!matterId || !userId || !reason.trim()) { toast.error("Fill in matter, person and reason"); return; }
    const { error } = await supabase.from("matter_ethical_walls").insert({ matter_id: matterId, user_id: userId, reason });
    if (error) toast.error(error.message);
    else { toast.success("Ethical wall added"); setReason(""); setMatterId(""); setUserId(""); qc.invalidateQueries({ queryKey: ["ethical-walls"] }); }
  }
  async function remove(id: string) {
    const { error } = await supabase.from("matter_ethical_walls").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Ethical wall removed"); qc.invalidateQueries({ queryKey: ["ethical-walls"] }); }
  }

  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="eyebrow mb-1">Ethical walls</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Screening someone from a matter hides it from them everywhere — they can't open it, and it won't appear in their lists or search.
      </p>
      <form onSubmit={add} className="mb-5 flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs space-y-1.5">
          <Label>Matter</Label>
          <Select value={matterId} onValueChange={setMatterId}>
            <SelectTrigger><SelectValue placeholder="Select matter" /></SelectTrigger>
            <SelectContent>{data?.matters.map((m) => <SelectItem key={m.id} value={m.id}><span className="tabular mr-1 text-xs">{m.matter_number}</span>{m.title}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="w-full max-w-xs space-y-1.5">
          <Label>Person screened out</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger><SelectValue placeholder="Select person" /></SelectTrigger>
            <SelectContent>{data?.profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="w-full max-w-xs space-y-1.5">
          <Label>Reason</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Previously advised the opposing party" />
        </div>
        <Button type="submit" variant="outline">Add wall</Button>
      </form>
      {data?.walls.length ? (
        <ul className="divide-y">
          {data.walls.map((w: any) => (
            <li key={w.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{w.user?.full_name ?? "—"} <span className="text-muted-foreground">screened from</span> <span className="tabular">{w.matter?.matter_number}</span> {w.matter?.title}</div>
                <div className="text-xs text-muted-foreground">{w.reason}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => remove(w.id)}>Remove</Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No ethical walls in place.</p>
      )}
    </section>
  );
}
