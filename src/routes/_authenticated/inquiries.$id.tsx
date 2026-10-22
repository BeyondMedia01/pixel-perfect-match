import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useProfiles, isPartner, isFrontdesk } from "@/lib/auth";
import { areaLabel, INQUIRY_STATUS_LABELS, type InquiryStatus } from "@/lib/legal";
import { useConflictHits, useConflictCount, isAdverse, logInquiryActivity, type ConflictHit } from "@/lib/inquiries";
import { EmptyState } from "@/components/app-shell";
import { Field } from "@/components/matter-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export const Route = createFileRoute("/_authenticated/inquiries/$id")({
  head: () => ({ meta: [{ title: "Inquiry — Docket" }, { name: "description", content: "Inquiry details, conflict check and intake decision." }] }),
  component: InquiryPage,
});

type Inquiry = {
  id: string; name: string; contact: string; practice_area: string; status: InquiryStatus;
  opposing_party: string | null; related_names: string | null; summary: string;
  received_at: string; logged_by: string | null; consult_with: string | null; consult_event_id: string | null;
  matter_id: string | null; decline_reason: string | null; signoff_by: string | null;
  signoff_at: string | null; signoff_basis: string | null; signoff_note: string | null;
};

function InquiryPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: profiles } = useProfiles();
  const { data, isLoading } = useQuery({
    queryKey: ["inquiry", id],
    queryFn: async () => {
      const [inq, history] = await Promise.all([
        supabase.from("inquiries").select("*, consult:profiles!inquiries_consult_with_fkey(full_name), signed:profiles!inquiries_signoff_by_fkey(full_name), logger:profiles!inquiries_logged_by_fkey(full_name)").eq("id", id).maybeSingle(),
        supabase.from("activity_log").select("*").eq("entity_type", "inquiry").eq("entity_id", id).order("created_at", { ascending: false }),
      ]);
      return { inquiry: inq.data as (Inquiry & { consult?: { full_name: string } | null; signed?: { full_name: string } | null; logger?: { full_name: string } | null }) | null, history: history.data ?? [] };
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data?.inquiry) return <EmptyState title="Inquiry not found" body="It may have been removed, or you may not have access." action={<Button asChild variant="outline"><Link to="/inquiries">Back to inquiries</Link></Button>} />;
  const i = data.inquiry;
  const fd = isFrontdesk(me?.role);
  const terms = [i.name, i.opposing_party ?? "", i.related_names ?? ""];
  const refresh = () => qc.invalidateQueries({ queryKey: ["inquiry", id] });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <p className="eyebrow">Inquiry · {format(new Date(i.received_at), "d MMMM yyyy, HH:mm")} · logged by {i.logger?.full_name ?? "—"}</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <h1 className="page-title">{i.name}</h1>
          <Badge variant={i.status === "declined" ? "quiet" : i.status === "accepted" ? "closed" : i.status === "new" ? "intake" : "hold"}>{INQUIRY_STATUS_LABELS[i.status]}</Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <dl className="grid gap-x-6 gap-y-4 rounded-lg border bg-card p-5 sm:grid-cols-2">
            <Item k="Area of law" v={areaLabel(i.practice_area as never)} />
            <Item k="Contact" v={i.contact} />
            <Item k="Opposing party" v={i.opposing_party} />
            <Item k="Related names" v={i.related_names} />
            <div className="sm:col-span-2"><Item k="Summary" v={i.summary} /></div>
            {i.status === "consult" && <Item k="Consultation with" v={i.consult?.full_name ?? "—"} />}
            {i.status === "declined" && <div className="sm:col-span-2"><Item k="Decline reason" v={fd ? "Recorded (restricted)" : i.decline_reason} /></div>}
          </dl>

          <ConflictBox inquiry={i} frontdesk={fd} />

          {i.signoff_by && (
            <div className="rounded-lg border bg-card p-5 text-sm">
              <h3 className="eyebrow mb-2">Partner sign-off</h3>
              <p>Approved by <strong>{i.signed?.full_name ?? "—"}</strong> on {i.signoff_at ? format(new Date(i.signoff_at), "d MMM yyyy") : "—"}.</p>
              <p className="text-muted-foreground">Basis: {i.signoff_basis === "no_adverse" ? "No adverse match" : i.signoff_basis === "waiver" ? "Informed consent (waiver)" : "Other"} — {i.signoff_note}</p>
            </div>
          )}

          <History history={data.history} />
        </div>

        <div>
          <NextSteps inquiry={i} me={me} profiles={profiles} onChange={refresh} />
        </div>
      </div>
    </div>
  );
}

function ConflictBox({ inquiry, frontdesk }: { inquiry: Inquiry; frontdesk: boolean }) {
  const terms = [inquiry.name, inquiry.opposing_party ?? "", inquiry.related_names ?? ""];
  const hits = useConflictHits(terms, !frontdesk);
  const count = useConflictCount(terms, frontdesk);

  if (frontdesk) {
    if (count.isFetching) return <p className="text-xs text-muted-foreground">Running conflict check…</p>;
    const n = count.data ?? 0;
    return n === 0 ? (
      <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-sm"><p className="flex items-center gap-1.5 font-medium text-success"><CheckCircle2 className="h-4 w-4" /> Clear — no potential conflicts. You may book the consultation.</p></div>
    ) : (
      <div className="rounded-lg border border-signal/40 bg-signal/10 p-4 text-sm"><p className="flex items-center gap-1.5 font-medium text-signal"><AlertTriangle className="h-4 w-4" /> {n} possible match{n === 1 ? "" : "es"}. Refer this inquiry to a lawyer — do not book a consultation.</p></div>
    );
  }

  if (hits.isFetching) return <p className="text-xs text-muted-foreground">Running conflict check…</p>;
  const rows = hits.data ?? [];
  if (rows.length === 0) return (
    <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-sm"><p className="flex items-center gap-1.5 font-medium text-success"><CheckCircle2 className="h-4 w-4" /> No conflicts found across matters, clients, parties and declined inquiries.</p></div>
  );
  const adverse = rows.filter((h) => isAdverse(h, inquiry.name, [inquiry.opposing_party ?? "", inquiry.related_names ?? ""]));
  return (
    <div className={"rounded-lg border p-4 text-sm " + (adverse.length ? "border-destructive/40 bg-destructive/10" : "border-signal/40 bg-signal/10")}>
      <p className={"mb-2 flex items-center gap-1.5 font-semibold " + (adverse.length ? "text-destructive" : "text-signal-foreground dark:text-signal")}>
        <AlertTriangle className="h-4 w-4" />
        {adverse.length ? `Adverse match — partner sign-off required (${rows.length} match${rows.length === 1 ? "" : "es"})` : `${rows.length} possible match${rows.length === 1 ? "" : "es"}`}
      </p>
      <ul className="space-y-1 text-xs">
        {rows.slice(0, 10).map((r: ConflictHit, idx: number) => (
          <li key={idx}>
            <strong>{r.name}</strong> — {r.source.replace("_", " ")}
            {r.matter_number && <> on <span className="tabular">{r.matter_number}</span> ({r.detail})</>}
            {isAdverse(r, inquiry.name, [inquiry.opposing_party ?? "", inquiry.related_names ?? ""]) && <span className="font-semibold text-destructive"> · adverse</span>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Declined prospects stay on file here, so this check keeps working years later.</p>
    </div>
  );
}

function NextSteps({ inquiry: i, me, profiles, onChange }: { inquiry: Inquiry & { consult?: { full_name: string } | null }; me: any; profiles: any[] | undefined; onChange: () => void }) {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<"consult" | "accept" | "decline" | "signoff" | null>(null);
  const [busy, setBusy] = useState(false);
  const fd = isFrontdesk(me?.role);
  const partner = isPartner(me?.role);
  const terms = [i.name, i.opposing_party ?? "", i.related_names ?? ""];
  const hits = useConflictHits(terms, !fd);
  const count = useConflictCount(terms, fd);
  const adverse = fd ? (count.data ?? 0) > 0 : (hits.data ?? []).some((h) => isAdverse(h, i.name, [i.opposing_party ?? "", i.related_names ?? ""]));
  const signedOff = !!i.signoff_by;

  const [consultWith, setConsultWith] = useState("");
  const [consultDate, setConsultDate] = useState("");
  const [consultTime, setConsultTime] = useState("10:00");
  const [consultLoc, setConsultLoc] = useState("Boardroom");
  const [declineReason, setDeclineReason] = useState("");
  const [basis, setBasis] = useState("no_adverse");
  const [signoffNote, setSignoffNote] = useState("");

  async function bookConsult(e: React.FormEvent) {
    e.preventDefault();
    if (!consultWith || !consultDate) { toast.error("Choose a lawyer and a date"); return; }
    setBusy(true);
    const startsAt = new Date(`${consultDate}T${consultTime}`).toISOString();
    const { data: ev, error } = await supabase.from("events").insert({
      inquiry_id: i.id, matter_id: null, title: `Consultation: ${i.name}`, type: "meeting",
      starts_at: startsAt, location: consultLoc || null, owner_id: me.user.id, entered_by: me.user.id,
    }).select("id").single();
    if (error) { setBusy(false); toast.error(error.message); return; }
    const { error: upErr } = await supabase.from("inquiries").update({ status: "consult", consult_with: consultWith, consult_event_id: ev.id }).eq("id", i.id);
    setBusy(false);
    if (upErr) { toast.error(upErr.message); return; }
    await logInquiryActivity(i.id, "consult_booked", `Consultation booked for ${format(new Date(startsAt), "d MMM yyyy, HH:mm")}.`, me.user.id);
    toast.success("Consultation booked");
    setDialog(null); onChange();
  }

  async function signoff(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("inquiries").update({ signoff_by: me.user.id, signoff_at: new Date().toISOString(), signoff_basis: basis, signoff_note: signoffNote }).eq("id", i.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await logInquiryActivity(i.id, "signoff", `Partner sign-off: ${basis === "no_adverse" ? "no adverse match" : basis === "waiver" ? "informed consent" : "other"} — ${signoffNote}`, me.user.id);
    toast.success("Sign-off recorded");
    setDialog(null); onChange();
  }

  async function decline(e: React.FormEvent) {
    e.preventDefault();
    if (!declineReason.trim()) { toast.error("Give a reason"); return; }
    setBusy(true);
    const { error } = await supabase.from("inquiries").update({ status: "declined", decline_reason: declineReason }).eq("id", i.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await logInquiryActivity(i.id, "declined", `Declined: ${declineReason}`, me.user.id);
    toast.success("Inquiry declined — kept on record for future conflict checks");
    setDialog(null); onChange();
  }

  async function accept() {
    if (adverse && !signedOff) { toast.error("Partner sign-off required before accepting"); return; }
    setBusy(true);
    const { data: client, error: cErr } = await supabase.from("clients").insert({
      name: i.name, type: "individual",
      email: i.contact.includes("@") ? i.contact : null, phone: i.contact.includes("@") ? null : i.contact,
      notes: `Created from inquiry received ${format(new Date(i.received_at), "d MMM yyyy")}.`,
      created_by: me.user.id,
    }).select("id").single();
    if (cErr) { setBusy(false); toast.error(cErr.message); return; }
    const { data: matter, error: mErr } = await supabase.from("matters").insert({
      title: `${i.name}: new ${areaLabel(i.practice_area as never).toLowerCase()} matter`,
      client_id: client.id, practice_area: i.practice_area as never, status: "intake",
      opposing_party: i.opposing_party, responsible_lawyer_id: i.consult_with ?? me.user.id,
      description: i.summary, created_by: me.user.id,
    }).select("id").single();
    if (mErr) { setBusy(false); toast.error(mErr.message); return; }
    const { error: upErr } = await supabase.from("inquiries").update({ status: "accepted", matter_id: matter.id }).eq("id", i.id);
    setBusy(false);
    if (upErr) { toast.error(upErr.message); return; }
    await logInquiryActivity(i.id, "accepted", "Client and matter created.", me.user.id);
    toast.success("Matter opened at intake");
    navigate({ to: "/matters/$id", params: { id: matter.id } });
  }

  if (i.status === "accepted") return (
    <div className="rounded-lg border bg-card p-5 text-sm">
      <h3 className="eyebrow mb-2">Next step</h3>
      <p className="mb-3 text-muted-foreground">This inquiry was accepted and opened as a matter.</p>
      <Button asChild variant="outline"><Link to="/matters/$id" params={{ id: i.matter_id! }}>Open the matter</Link></Button>
    </div>
  );
  if (i.status === "declined") return (
    <div className="rounded-lg border bg-card p-5 text-sm">
      <h3 className="eyebrow mb-2">Next step</h3>
      <p className="text-muted-foreground">Declined and kept on record — this prospect stays in every future conflict check.</p>
    </div>
  );

  return (
    <div className="rounded-lg border bg-card p-5 text-sm">
      <h3 className="eyebrow mb-3">Next step</h3>
      <div className="space-y-2">
        {i.status === "new" && (
          <Button className="w-full" variant="outline" disabled={adverse && fd} onClick={() => setDialog("consult")}>
            Book consultation
          </Button>
        )}
        {!fd && (
          <>
            <Button className="w-full" disabled={adverse && !signedOff} onClick={accept}>Accept &amp; open matter</Button>
            {adverse && !signedOff && (
              partner ? (
                <Button className="w-full" variant="outline" onClick={() => setDialog("signoff")}>Record partner sign-off</Button>
              ) : (
                <p className="text-xs text-destructive">Acceptance is blocked until a partner signs off on the conflict.</p>
              )
            )}
            <Button className="w-full" variant="ghost" onClick={() => setDialog("decline")}>Decline</Button>
          </>
        )}
        {fd && adverse && <p className="text-xs text-signal">Possible conflict — refer to a lawyer.</p>}
      </div>

      <Dialog open={dialog === "consult"} onOpenChange={(o) => setDialog(o ? "consult" : null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-serif text-2xl font-normal">Book a consultation</DialogTitle></DialogHeader>
          <form onSubmit={bookConsult} className="grid gap-4 sm:grid-cols-2">
            <Field label="Consulting lawyer" className="sm:col-span-2">
              <Select value={consultWith} onValueChange={setConsultWith}>
                <SelectTrigger><SelectValue placeholder="Choose a lawyer" /></SelectTrigger>
                <SelectContent>{profiles?.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Date"><Input type="date" required value={consultDate} onChange={(e) => setConsultDate(e.target.value)} /></Field>
            <Field label="Time"><Input type="time" required value={consultTime} onChange={(e) => setConsultTime(e.target.value)} /></Field>
            <Field label="Location" className="sm:col-span-2"><Input value={consultLoc} onChange={(e) => setConsultLoc(e.target.value)} /></Field>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Booking…" : "Book"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "signoff"} onOpenChange={(o) => setDialog(o ? "signoff" : null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-serif text-2xl font-normal">Partner sign-off</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Record why this inquiry may be accepted despite a possible conflict.</p>
          <form onSubmit={signoff} className="space-y-4">
            <RadioGroup value={basis} onValueChange={setBasis} className="space-y-2">
              {[
                { v: "no_adverse", l: "Match reviewed — not adverse", d: "The matched person or company is not on the other side of this matter." },
                { v: "waiver", l: "Adverse, but both parties consent", d: "Written informed consent has been obtained." },
                { v: "other", l: "Other", d: "Explain below." },
              ].map((o) => (
                <Label key={o.v} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm font-normal">
                  <RadioGroupItem value={o.v} className="mt-0.5" />
                  <span><span className="font-medium">{o.l}</span><br /><span className="text-xs text-muted-foreground">{o.d}</span></span>
                </Label>
              ))}
            </RadioGroup>
            <Field label="Reason / note"><Textarea required value={signoffNote} onChange={(e) => setSignoffNote(e.target.value)} /></Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Record sign-off"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "decline"} onOpenChange={(o) => setDialog(o ? "decline" : null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-serif text-2xl font-normal">Decline this inquiry</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Declined inquiries stay on record so future conflict checks keep catching them.</p>
          <form onSubmit={decline} className="space-y-4">
            <Field label="Reason"><Textarea required value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} placeholder="e.g. Conflicted out — firm acts for the other side." /></Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit" variant="destructive" disabled={busy}>{busy ? "Saving…" : "Decline inquiry"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function History({ history }: { history: { id: string; action: string; summary: string | null; created_at: string }[] }) {
  if (!history.length) return null;
  return (
    <div className="rounded-lg border bg-card p-5">
      <h3 className="eyebrow mb-3">History</h3>
      <ul className="space-y-2 text-sm">
        {history.map((h) => (
          <li key={h.id} className="flex gap-3">
            <span className="tabular shrink-0 text-xs text-muted-foreground">{formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}</span>
            <span>{h.summary ?? h.action}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Item({ k, v }: { k: string; v?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="mt-0.5 text-sm">{v || "—"}</dd>
    </div>
  );
}
