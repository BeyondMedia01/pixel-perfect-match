import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, isFrontdesk } from "@/lib/auth";
import { PRACTICE_AREAS, type PracticeArea } from "@/lib/legal";
import { useConflictHits, useConflictCount, isAdverse, logInquiryActivity } from "@/lib/inquiries";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "./matter-form";

export function NewInquiryDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [f, setF] = useState({
    name: "", contact: "", practice_area: "other" as PracticeArea,
    opposing_party: "", related_names: "", summary: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const terms = [f.name, f.opposing_party, f.related_names];
  const fd = isFrontdesk(me?.role);
  const hits = useConflictHits(terms, !fd);
  const count = useConflictCount(terms, fd);
  const matchCount = fd ? (count.data ?? null) : (hits.data?.length ?? null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.from("inquiries").insert({
      ...f,
      related_names: f.related_names || null,
      logged_by: me!.user.id,
    }).select("id").single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await logInquiryActivity(data.id, "created", `Inquiry logged for ${f.name}.`, me!.user.id);
    toast.success("Inquiry logged");
    qc.invalidateQueries({ queryKey: ["inquiries"] });
    setOpen(false);
    setF({ name: "", contact: "", practice_area: "other", opposing_party: "", related_names: "", summary: "" });
    navigate({ to: "/inquiries/$id", params: { id: data.id } });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle className="font-serif text-2xl font-normal">Log a new inquiry</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Log every call and walk-in before giving advice — the conflict check runs automatically.
        </p>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Prospect's full name"><Input required value={f.name} onChange={(e) => set("name")(e.target.value)} /></Field>
          <Field label="Phone or email"><Input required value={f.contact} onChange={(e) => set("contact")(e.target.value)} /></Field>
          <Field label="Area of law">
            <Select value={f.practice_area} onValueChange={(v) => set("practice_area")(v as PracticeArea)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRACTICE_AREAS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Opposing party (if any)"><Input value={f.opposing_party} onChange={(e) => set("opposing_party")(e.target.value)} placeholder="Company or person on the other side" /></Field>
          <Field label="Related names" className="sm:col-span-2"><Input value={f.related_names} onChange={(e) => set("related_names")(e.target.value)} placeholder="Spouse, business partners, relatives — comma separated" /></Field>
          <Field label="What happened (brief)" className="sm:col-span-2"><Textarea required value={f.summary} onChange={(e) => set("summary")(e.target.value)} /></Field>

          <div className="sm:col-span-2">
            {matchCount === null || terms.every((t) => t.trim().length < 3) ? (
              <p className="text-xs text-muted-foreground">Conflict check runs as you type the names above.</p>
            ) : (hits.isFetching || count.isFetching) ? (
              <p className="text-xs text-muted-foreground">Running conflict check…</p>
            ) : fd ? (
              matchCount === 0 ? (
                <p className="flex items-center gap-1.5 text-xs text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Clear — no potential conflicts. You can book the consultation.</p>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-signal"><AlertTriangle className="h-3.5 w-3.5" /> {matchCount} possible match{matchCount === 1 ? "" : "es"}. Please refer this inquiry to a lawyer — do not book a consultation.</p>
              )
            ) : (hits.data ?? []).some((h) => isAdverse(h, f.name, [f.opposing_party, f.related_names])) ? (
              <p className="flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> Adverse match — acceptance will need partner sign-off.</p>
            ) : matchCount > 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-signal"><AlertTriangle className="h-3.5 w-3.5" /> {matchCount} possible match{matchCount === 1 ? "" : "es"} — review on the inquiry page.</p>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-success"><CheckCircle2 className="h-3.5 w-3.5" /> No conflicts found.</p>
            )}
          </div>

          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Log inquiry"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
