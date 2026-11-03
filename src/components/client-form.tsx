import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "./matter-form";

export function NewClientDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: "", type: "individual" as "individual" | "company",
    id_number: "", email: "", phone: "", address: "", notes: "",
  });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("clients").insert({ ...f, created_by: me?.user.id ?? null });
    if (error) { toast.error(error.message); return; }
    toast.success("Client added");
    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["clients-min"] });
    setF({ name: "", type: "individual", id_number: "", email: "", phone: "", address: "", notes: "" });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle className="text-xl font-semibold">Add a client</DialogTitle></DialogHeader>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2"><Input required value={f.name} onChange={(e) => set("name")(e.target.value)} /></Field>
          <Field label="Type">
            <Select value={f.type} onValueChange={set("type")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="company">Company</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="ID / registration no."><Input value={f.id_number} onChange={(e) => set("id_number")(e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={(e) => set("email")(e.target.value)} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={(e) => set("phone")(e.target.value)} /></Field>
          <Field label="Address" className="sm:col-span-2"><Input value={f.address} onChange={(e) => set("address")(e.target.value)} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => set("notes")(e.target.value)} /></Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Add client</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
