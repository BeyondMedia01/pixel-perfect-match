import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useProfiles, isInternalRole, isLawyerish, isPartner } from "@/lib/auth";
import { EVENT_LABELS, MATTER_STATUSES, TASK_STATUS_LABELS, areaLabel, isDeadlineType, isUrgent, statusMeta, type MatterStatus, type EventType } from "@/lib/legal";
import { EmptyState } from "@/components/app-shell";
import { Field } from "@/components/matter-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DocumentList } from "@/components/document-list";
import { MatterBilling } from "@/components/matter-billing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/matters/$id")({
  head: () => ({ meta: [{ title: "Matter — Docket" }, { name: "description", content: "Matter details, timeline and team." }, { property: "og:title", content: "Matter — Docket" }, { property: "og:description", content: "Matter details, timeline and team." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: MatterPage,
});

function MatterPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: profiles } = useProfiles();
  const { data, isLoading } = useQuery({
    queryKey: ["matter", id],
    queryFn: async () => {
      const [m, notes, events, tasks, parties, team, log] = await Promise.all([
        supabase.from("matters").select("*, clients(id, name, email, phone), lawyer:profiles!matters_responsible_lawyer_id_fkey(full_name)").eq("id", id).maybeSingle(),
        supabase.from("notes").select("*, author:profiles(full_name)").eq("matter_id", id).order("created_at", { ascending: false }),
        supabase.from("events").select("*").eq("matter_id", id).order("starts_at"),
        supabase.from("tasks").select("*, assignee:profiles(full_name)").eq("matter_id", id).order("due_date"),
        supabase.from("related_parties").select("*").eq("matter_id", id),
        supabase.from("matter_assignments").select("id, user_id, profiles(full_name, email)").eq("matter_id", id),
        supabase.from("activity_log").select("*").eq("matter_id", id).order("created_at", { ascending: false }),
      ]);
      return {
        matter: m.data, notes: notes.data ?? [], events: events.data ?? [], tasks: tasks.data ?? [],
        parties: parties.data ?? [], team: team.data ?? [], log: log.data ?? [],
      };
    },
  });
  const [note, setNote] = useState("");
  const [addUser, setAddUser] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["matter", id] });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data?.matter) return <EmptyState title="Matter not found" body="It may have been deleted, or you may not be assigned to it." action={<Button asChild variant="outline"><Link to="/matters">Back to matters</Link></Button>} />;
  const m = data.matter;
  const internal = isInternalRole(me?.role);
  const lawyerish = isLawyerish(me?.role);

  async function changeStatus(s: MatterStatus) {
    const { error } = await supabase.from("matters").update({ status: s, date_closed: s === "closed" ? new Date().toISOString().slice(0, 10) : null }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Status updated"); refresh(); }
  }
  async function addNote() {
    if (!note.trim()) return;
    const { error } = await supabase.from("notes").insert({ matter_id: id, body: note, author_id: me!.user.id });
    if (error) toast.error(error.message); else { setNote(""); refresh(); }
  }
  async function assign() {
    if (!addUser) return;
    const { error } = await supabase.from("matter_assignments").insert({ matter_id: id, user_id: addUser });
    if (error) toast.error(error.message); else { setAddUser(""); refresh(); }
  }

  const timeline = [
    ...data.log.map((l) => ({ at: l.created_at, kind: "Activity", text: l.summary ?? l.action, who: undefined as string | undefined })),
    ...data.notes.map((n) => ({ at: n.created_at, kind: "Note", text: n.body, who: n.author?.full_name })),
    ...data.events.map((e) => ({ at: e.starts_at, kind: EVENT_LABELS[e.type], text: e.title, who: undefined as string | undefined })),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at));

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <p className="eyebrow"><span className="tabular">{m.matter_number}</span> · {areaLabel(m.practice_area)}</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <h1 className="page-title max-w-3xl">{m.title}</h1>
          {internal ? (
            <Select value={m.status} onValueChange={(v) => changeStatus(v as MatterStatus)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{MATTER_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          ) : <Badge variant={statusMeta(m.status).variant}>{statusMeta(m.status).label}</Badge>}
        </div>
        {m.clients && <Link to="/clients/$id" params={{ id: m.clients.id }} className="mt-1 inline-block text-sm text-muted-foreground hover:underline">{m.clients.name}</Link>}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-6 flex h-auto flex-wrap justify-start">
          {["overview", "timeline", "documents", "tasks", "calendar", "billing", "notes", "contacts"].map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize">{t === "billing" ? "Time & Billing" : t}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 lg:grid-cols-3">
            <dl className="grid gap-x-6 gap-y-4 rounded-lg border bg-card p-5 sm:grid-cols-2 lg:col-span-2">
              <Item k="Responsible lawyer" v={m.lawyer?.full_name ?? null} />
              <Item k="Court / jurisdiction" v={m.court} />
              <Item k="Case number" v={m.case_number} mono />
              <Item k="Opposing party" v={m.opposing_party} />
              <Item k="Opposing counsel" v={m.opposing_counsel} />
              <Item k="Opened" v={format(new Date(m.date_opened), "d MMMM yyyy")} />
              <Item k="Closed" v={m.date_closed ? format(new Date(m.date_closed), "d MMMM yyyy") : null} />
              <div className="sm:col-span-2"><Item k="Description" v={m.description} /></div>
            </dl>
            <div className="space-y-6">
              <div className="rounded-lg border bg-card p-5">
                <h3 className="eyebrow mb-3">Next dates</h3>
                {data.events.filter((e) => new Date(e.starts_at) > new Date()).slice(0, 3).map((e) => (
                  <div key={e.id} className="mb-2 text-sm">
                    <span className={isUrgent(e.starts_at) ? "text-destructive" : ""}>{format(new Date(e.starts_at), "EEE d MMM, HH:mm")}</span>
                    <div className="text-muted-foreground">{e.title}</div>
                  </div>
                ))}
                {!data.events.some((e) => new Date(e.starts_at) > new Date()) && <p className="text-sm text-muted-foreground">None scheduled.</p>}
              </div>
              {isPartner(me?.role) && <EthicalWallNote matterId={id} />}
              <div className="rounded-lg border bg-card p-5">
                <h3 className="eyebrow mb-3">Team</h3>
                <ul className="mb-3 space-y-1 text-sm">
                  {m.lawyer && <li>{m.lawyer.full_name} <span className="text-xs text-muted-foreground">· responsible</span></li>}
                  {data.team.map((t) => <li key={t.id}>{t.profiles?.full_name || t.profiles?.email}</li>)}
                </ul>
                {internal && (
                  <div className="flex gap-2">
                    <Select value={addUser} onValueChange={setAddUser}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Add team member" /></SelectTrigger>
                      <SelectContent>{profiles?.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" onClick={assign}>Add</Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="timeline">
          {timeline.length === 0 ? <EmptyState title="No activity yet" body="Status changes, notes and hearings will appear here." /> : (
            <ol className="relative ml-2 border-l pl-6">
              {timeline.map((t, i) => (
                <li key={i} className="mb-6">
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                  <div className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{t.kind}</span> · {format(new Date(t.at), "d MMM yyyy, HH:mm")}{t.who && ` · ${t.who}`}</div>
                  <p className="mt-1 text-sm">{t.text}</p>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>

        <TabsContent value="documents"><DocumentList matterId={id} /></TabsContent>
        <TabsContent value="billing"><MatterBilling matterId={id} clientId={m.client_id} /></TabsContent>

        <TabsContent value="tasks">
          {data.tasks.length === 0 ? <EmptyState title="No tasks" body="Tasks linked to this matter will appear here." /> : (
            <ul className="divide-y rounded-lg border bg-card">
              {data.tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-4 px-4 py-3 text-sm">
                  <span className="flex-1">{t.title}</span>
                  <span className="text-xs text-muted-foreground">{t.assignee?.full_name ?? "Unassigned"}</span>
                  <span className="tabular w-20 text-xs">{t.due_date ? format(new Date(t.due_date), "d MMM") : "—"}</span>
                  <Badge variant={t.status === "done" ? "closed" : "quiet"}>{TASK_STATUS_LABELS[t.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="calendar">
          {internal && (
            <div className="mb-4 flex justify-end">
              <AddDeadlineDialog matterId={id} me={me} onChange={refresh} trigger={<Button variant="outline" size="sm">Add court date / deadline</Button>} />
            </div>
          )}
          {data.events.length === 0 ? <EmptyState title="No dates" body="Court dates and deadlines for this matter will appear here." /> : (
            <ul className="divide-y rounded-lg border bg-card">
              {data.events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-4 px-4 py-3 text-sm">
                  <span className={"tabular w-36 text-xs " + (isUrgent(e.starts_at) && isDeadlineType(e.type) ? "font-semibold text-destructive" : "")}>{format(new Date(e.starts_at), "EEE d MMM, HH:mm")}</span>
                  <span className="min-w-0 flex-1">
                    {e.title}
                    {isDeadlineType(e.type) && !e.confirmed_by && !e.filed_at && <span className="ml-2 text-xs text-warning">awaiting lawyer confirmation</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">{e.location}</span>
                  {isDeadlineType(e.type) && (
                    e.filed_at ? (
                      <Badge variant="closed">Filed</Badge>
                    ) : e.confirmed_by ? (
                      <>
                        <Badge variant="quiet">Confirmed</Badge>
                        {internal && e.type === "filing_deadline" && <MarkFiledButton eventId={e.id} onChange={refresh} />}
                      </>
                    ) : lawyerish ? (
                      <ConfirmDeadlineButton eventId={e.id} onChange={refresh} />
                    ) : null
                  )}
                  <Badge variant="quiet">{EVENT_LABELS[e.type]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="notes">
          {internal && (
            <div className="mb-6 rounded-lg border bg-card p-4">
              <Textarea placeholder="Add an internal note…" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="mt-2 flex justify-end"><Button size="sm" onClick={addNote}>Save note</Button></div>
            </div>
          )}
          <ul className="space-y-3">
            {data.notes.map((n) => (
              <li key={n.id} className="rounded-lg border bg-card p-4">
                <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                <p className="mt-2 text-xs text-muted-foreground">{n.author?.full_name ?? "Firm"} · {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="contacts">
          <ContactsTab matterId={id} parties={data.parties} onChange={refresh} canEdit={internal} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ContactsTab({ matterId, parties, onChange, canEdit }: { matterId: string; parties: { id: string; name: string; role: string; organisation: string | null }[]; onChange: () => void; canEdit: boolean }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("related_party");
  async function add() {
    if (!name.trim()) return;
    const { error } = await supabase.from("related_parties").insert({ matter_id: matterId, name, role: role as "related_party" });
    if (error) toast.error(error.message); else { setName(""); onChange(); }
  }
  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["opposing_party", "opposing_counsel", "related_party", "witness", "other"].map((r) => <SelectItem key={r} value={r} className="capitalize">{r.replace("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={add}>Add contact</Button>
        </div>
      )}
      {parties.length === 0 ? <EmptyState title="No contacts" body="Add opposing parties, counsel and witnesses — they're included in conflict checks." /> : (
        <ul className="divide-y rounded-lg border bg-card">
          {parties.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span>{p.name}{p.organisation && <span className="text-muted-foreground"> · {p.organisation}</span>}</span>
              <Badge variant="quiet" className="capitalize">{p.role.replace("_", " ")}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EthicalWallNote({ matterId }: { matterId: string }) {
  const { data: walls } = useQuery({
    queryKey: ["matter-walls", matterId],
    queryFn: async () =>
      (await supabase.from("matter_ethical_walls").select("id, reason, user:profiles!matter_ethical_walls_user_id_fkey(full_name)").eq("matter_id", matterId)).data ?? [],
  });
  if (!walls?.length) return null;
  return (
    <div className="rounded-lg border border-signal/40 bg-signal/10 p-5">
      <h3 className="eyebrow mb-2 text-signal">Ethical wall</h3>
      <ul className="space-y-1 text-sm">
        {walls.map((w: any) => (
          <li key={w.id}><strong>{w.user?.full_name ?? "—"}</strong> is screened from this matter. <span className="text-muted-foreground">{w.reason}</span></li>
        ))}
      </ul>
    </div>
  );
}

function ConfirmDeadlineButton({ eventId, onChange }: { eventId: string; onChange: () => void }) {
  async function confirm() {
    const { error } = await supabase.from("events").update({ confirmed_by: (await supabase.auth.getUser()).data.user?.id ?? null }).eq("id", eventId);
    if (error) toast.error(error.message); else { toast.success("Deadline confirmed"); onChange(); }
  }
  return <Button size="sm" variant="outline" onClick={confirm}>Confirm</Button>;
}

function MarkFiledButton({ eventId, onChange }: { eventId: string; onChange: () => void }) {
  async function file() {
    const { error } = await supabase.from("events").update({ filed_at: new Date().toISOString() }).eq("id", eventId);
    if (error) toast.error(error.message); else { toast.success("Marked as filed"); onChange(); }
  }
  return <Button size="sm" variant="outline" onClick={file}>Mark filed</Button>;
}

function AddDeadlineDialog({ matterId, me, onChange, trigger }: { matterId: string; me: any; onChange: () => void; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ title: "", type: "filing_deadline" as EventType, date: "", time: "17:00", location: "" });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const lawyerish = isLawyerish(me?.role);
    const { error } = await supabase.from("events").insert({
      matter_id: matterId, title: f.title, type: f.type,
      starts_at: new Date(`${f.date}T${f.time}`).toISOString(),
      location: f.location || null,
      owner_id: me?.user.id ?? null,
      entered_by: me?.user.id ?? null,
      confirmed_by: lawyerish ? me?.user.id ?? null : null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(lawyerish ? "Deadline added" : "Deadline added — a lawyer still needs to confirm it");
    setOpen(false);
    setF({ title: "", type: "filing_deadline", date: "", time: "17:00", location: "" });
    onChange();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif text-2xl font-normal">Add a court date or deadline</DialogTitle></DialogHeader>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" className="sm:col-span-2"><Input required value={f.title} onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. File answering affidavit" /></Field>
          <Field label="Type">
            <Select value={f.type} onValueChange={(v) => setF((p) => ({ ...p, type: v as EventType }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="filing_deadline">Filing deadline</SelectItem>
                <SelectItem value="court_date">Court date</SelectItem>
                <SelectItem value="hearing">Hearing</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Location"><Input value={f.location} onChange={(e) => setF((p) => ({ ...p, location: e.target.value }))} /></Field>
          <Field label="Date"><Input type="date" required value={f.date} onChange={(e) => setF((p) => ({ ...p, date: e.target.value }))} /></Field>
          <Field label="Time"><Input type="time" required value={f.time} onChange={(e) => setF((p) => ({ ...p, time: e.target.value }))} /></Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Add"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Item({ k, v, mono }: { k: string; v?: string | null; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className={"mt-0.5 text-sm " + (mono ? "tabular" : "")}>{v || "—"}</dd>
    </div>
  );
}
