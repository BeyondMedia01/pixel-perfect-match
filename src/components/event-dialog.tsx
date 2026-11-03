import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe, isLawyerish } from "@/lib/auth";
import { EVENT_LABELS, isDeadlineType, type EventType } from "@/lib/legal";
import { useConfirm } from "@/components/confirm";
import { Field } from "@/components/matter-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "__none__";

export type EditableEvent = {
  id: string;
  title: string;
  type: EventType;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  matter_id: string | null;
  confirmed_by: string | null;
  inquiry_id?: string | null;
};

/** Create an event (no `event`; `defaultDate` pre-fills the day) or edit one. */
export function EventDialog({ open, onOpenChange, event, defaultDate, matterId }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: EditableEvent | null;
  defaultDate?: Date | null;
  matterId?: string;
}) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const lawyer = isLawyerish(me?.role);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ title: "", type: "meeting" as EventType, date: "", start: "09:00", end: "10:00", location: "", matter_id: NONE });

  useEffect(() => {
    if (!open) return;
    if (event) {
      const s = new Date(event.starts_at);
      const e = event.ends_at ? new Date(event.ends_at) : null;
      setF({
        title: event.title, type: event.type, date: format(s, "yyyy-MM-dd"), start: format(s, "HH:mm"),
        end: e ? format(e, "HH:mm") : "", location: event.location ?? "", matter_id: event.matter_id ?? NONE,
      });
    } else {
      setF({ title: "", type: "meeting", date: format(defaultDate ?? new Date(), "yyyy-MM-dd"), start: "09:00", end: "10:00", location: "", matter_id: matterId ?? NONE });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id]);

  const { data: matters } = useQuery({
    queryKey: ["event-matters"],
    enabled: open && !matterId,
    queryFn: async () => (await supabase.from("matters").select("id, title, matter_number").neq("status", "closed").order("matter_number", { ascending: false })).data ?? [],
  });

  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const deadline = isDeadlineType(f.type);

  function done() {
    qc.invalidateQueries({ queryKey: ["calendar-events"] });
    qc.invalidateQueries({ queryKey: ["matter"] });
    qc.invalidateQueries({ queryKey: ["staff-notifications"] });
    onOpenChange(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title.trim() || !f.date || !f.start) { toast.error("Add a title, date and start time"); return; }
    const starts = new Date(`${f.date}T${f.start}`);
    const ends = f.end && !deadline ? new Date(`${f.date}T${f.end}`) : null;
    if (ends && ends <= starts) { toast.error("The end time must be after the start time"); return; }
    setBusy(true);
    const matter_id = f.matter_id === NONE ? null : f.matter_id;
    const values = { title: f.title.trim(), type: f.type, starts_at: starts.toISOString(), ends_at: ends?.toISOString() ?? null, location: f.location.trim() || null, matter_id };

    let confirmed_by: string | null | undefined;
    if (!event) confirmed_by = deadline && lawyer ? me!.user.id : null;
    else if (deadline && (values.starts_at !== new Date(event.starts_at).toISOString() || f.type !== event.type)) {
      // Moving a deadline needs a lawyer's confirmation again.
      confirmed_by = lawyer ? me!.user.id : null;
    }

    const { error } = event
      ? await supabase.from("events").update({ ...values, ...(confirmed_by !== undefined ? { confirmed_by } : {}) }).eq("id", event.id)
      : await supabase.from("events").insert({ ...values, confirmed_by: confirmed_by ?? null, owner_id: me?.user.id ?? null, entered_by: me?.user.id ?? null });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(deadline && !lawyer ? "Saved. A lawyer still needs to confirm this date." : event ? "Event updated" : "Event added");
    done();
  }

  async function remove() {
    if (!event) return;
    if (!(await confirm({ title: `Delete "${event.title}"?`, body: "It's removed from Acta and from everyone's subscribed calendars at their next refresh.", action: "Delete", destructive: true }))) return;
    const { data, error } = await supabase.from("events").delete().eq("id", event.id).select("id");
    if (error || !data?.length) { toast.error(error?.message ?? "You can't delete this event."); return; }
    toast.success("Event deleted");
    done();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="text-xl font-semibold">{event ? "Edit event" : "New event"}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" className="sm:col-span-2">
            <Input required autoFocus value={f.title} onChange={(e) => set("title")(e.target.value)} placeholder="e.g. Client meeting, Mhondoro Holdings" />
          </Field>
          <Field label="Type">
            <Select value={f.type} onValueChange={(v) => set("type")(v as EventType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(EVENT_LABELS) as EventType[]).map((t) => <SelectItem key={t} value={t}>{EVENT_LABELS[t]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Date"><Input type="date" required value={f.date} onChange={(e) => set("date")(e.target.value)} /></Field>
          <Field label={deadline ? "Time" : "Starts"}><Input type="time" required value={f.start} onChange={(e) => set("start")(e.target.value)} /></Field>
          {!deadline && <Field label="Ends"><Input type="time" value={f.end} onChange={(e) => set("end")(e.target.value)} /></Field>}
          <Field label="Location" className={deadline ? "" : "sm:col-span-2"}><Input value={f.location} onChange={(e) => set("location")(e.target.value)} placeholder="e.g. High Court, Court 4 or a video link" /></Field>
          {!matterId && (
            <Field label="Matter (optional)" className="sm:col-span-2">
              <Select value={f.matter_id} onValueChange={set("matter_id")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not linked to a matter (only you see it)</SelectItem>
                  {matters?.map((m) => <SelectItem key={m.id} value={m.id}>{m.matter_number} · {m.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          {deadline && !lawyer && (
            <p className="text-xs text-muted-foreground sm:col-span-2">Court dates and filing deadlines are marked unconfirmed until a lawyer confirms them.</p>
          )}
          <div className="flex items-center justify-between gap-2 sm:col-span-2">
            {event ? <Button type="button" variant="ghost" className="text-destructive" onClick={remove}>Delete</Button> : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : event ? "Save" : "Add event"}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
