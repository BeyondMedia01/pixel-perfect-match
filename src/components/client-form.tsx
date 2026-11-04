import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "./matter-form";

type ClientFields = {
  name: string;
  type: "individual" | "company";
  id_number: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
};
type EditableClient = {
  id: string;
  name: string;
  type: "individual" | "company";
  id_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
};

const blankClient: ClientFields = {
  name: "",
  type: "individual",
  id_number: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
};

/** Add a client, or edit one when `client` is given. */
export function NewClientDialog({
  trigger,
  client,
}: {
  trigger: React.ReactNode;
  client?: EditableClient;
}) {
  const [open, setOpen] = useState(false);
  const { data: me } = useMe();
  const qc = useQueryClient();
  const fromClient = (): ClientFields =>
    client
      ? {
          name: client.name,
          type: client.type,
          id_number: client.id_number ?? "",
          email: client.email ?? "",
          phone: client.phone ?? "",
          address: client.address ?? "",
          notes: client.notes ?? "",
        }
      : blankClient;
  const [f, setF] = useState<ClientFields>(fromClient);
  const set = (k: keyof ClientFields) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const values = {
      ...f,
      name: f.name.trim(),
      id_number: f.id_number.trim() || null,
      email: f.email.trim() || null,
      phone: f.phone.trim() || null,
      address: f.address.trim() || null,
      notes: f.notes.trim() || null,
    };
    if (client) {
      const { data, error } = await supabase
        .from("clients")
        .update(values)
        .eq("id", client.id)
        .select("id");
      if (error || !data?.length) {
        toast.error(error?.message ?? "You can't edit this client.");
        return;
      }
      toast.success("Client updated");
      qc.invalidateQueries({ queryKey: ["client", client.id] });
    } else {
      const { error } = await supabase
        .from("clients")
        .insert({ ...values, created_by: me?.user.id ?? null });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Client added");
      setF(blankClient);
    }
    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["clients-min"] });
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && client) setF(fromClient());
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {client ? "Edit client" : "Add a client"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2">
            <Input required value={f.name} onChange={(e) => set("name")(e.target.value)} />
          </Field>
          <Field label="Type">
            <Select value={f.type} onValueChange={set("type")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="company">Company</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="ID / registration no.">
            <Input value={f.id_number} onChange={(e) => set("id_number")(e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={f.email} onChange={(e) => set("email")(e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={f.phone} onChange={(e) => set("phone")(e.target.value)} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input value={f.address} onChange={(e) => set("address")(e.target.value)} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={f.notes} onChange={(e) => set("notes")(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{client ? "Save changes" : "Add client"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
