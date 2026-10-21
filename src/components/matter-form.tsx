import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useProfiles } from "@/lib/auth";
import { PRACTICE_AREAS, MATTER_STATUSES, type PracticeArea, type MatterStatus } from "@/lib/legal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConflictCheck } from "./conflict-check";

export function NewMatterDialog({ defaultClientId, trigger }: { defaultClientId?: string; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data: me } = useMe();
  const { data: profiles } = useProfiles();
  const { data: clients } = useQuery({
    queryKey: ["clients-min"],
    queryFn: async () => (await supabase.from("clients").select("id, name").order("name")).data ?? [],
  });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [f, setF] = useState({
    title: "", client_id: defaultClientId ?? "", practice_area: "litigation" as PracticeArea, status: "intake" as MatterStatus,
    responsible_lawyer_id: "", opposing_party: "", opposing_counsel: "", court: "", case_number: "", description: "",
  });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.client_id) return toast.error("Choose a client");
    const { data, error } = await supabase.from("matters").insert({
      ...f,
      responsible_lawyer_id: f.responsible_lawyer_id || me?.user.id || null,
      created_by: me?.user.id,
    }).select("id").single();
    if (error) return toast.error(error.message);
    toast.success("Matter opened");
    qc.invalidateQueries();
    setOpen(false);
    navigate({ to: "/matters/$id", params: { id: data.id } });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle className="font-serif text-2xl font-normal">Open a new matter</DialogTitle></DialogHeader>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" className="sm:col-span-2"><Input required value={f.title} onChange={(e) => set("title")(e.target.value)} /></Field>
          <Field label="Client">
            <Select value={f.client_id} onValueChange={set("client_id")}>
              <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
              <SelectContent>{clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Responsible lawyer">
            <Select value={f.responsible_lawyer_id} onValueChange={set("responsible_lawyer_id")}>
              <SelectTrigger><SelectValue placeholder="Me" /></SelectTrigger>
              <SelectContent>{profiles?.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Practice area">
            <Select value={f.practice_area} onValueChange={set("practice_area")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRACTICE_AREAS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={f.status} onValueChange={set("status")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MATTER_STATUSES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Opposing party"><Input value={f.opposing_party} onChange={(e) => set("opposing_party")(e.target.value)} /></Field>
          <Field label="Opposing counsel"><Input value={f.opposing_counsel} onChange={(e) => set("opposing_counsel")(e.target.value)} /></Field>
          <div className="sm:col-span-2"><ConflictCheck names={[f.opposing_party, f.opposing_counsel]} /></div>
          <Field label="Court / jurisdiction"><Input value={f.court} onChange={(e) => set("court")(e.target.value)} /></Field>
          <Field label="Case number"><Input value={f.case_number} onChange={(e) => set("case_number")(e.target.value)} /></Field>
          <Field label="Description" className="sm:col-span-2"><Textarea value={f.description} onChange={(e) => set("description")(e.target.value)} /></Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Open matter</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={"space-y-1.5 " + (className ?? "")}><Label>{label}</Label>{children}</div>;
}
