import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Megaphone, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, isInternalRole, isPartner } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/announcements")({
  head: () => ({ meta: [{ title: "Announcements — Docket" }, { name: "description", content: "Firm announcements and updates shared with clients." }] }),
  component: AnnouncementsPage,
});

type Announcement = {
  id: string; title: string; body: string; created_at: string; created_by: string | null; matter_id: string | null;
  author?: { full_name: string } | null;
  matter?: { title: string; matter_number: string | null } | null;
};

function NewAnnouncementDialog() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [matterId, setMatterId] = useState("firm");
  const [saving, setSaving] = useState(false);

  const { data: matters } = useQuery({
    queryKey: ["matters", "announce-targets"],
    enabled: open,
    queryFn: async () =>
      (await supabase.from("matters").select("id, title, matter_number").order("matter_number", { ascending: false })).data ?? [],
  });

  async function post() {
    if (!title.trim() || !body.trim() || !me) return;
    setSaving(true);
    const { error } = await supabase.from("announcements").insert({
      title: title.trim(),
      body: body.trim(),
      matter_id: matterId === "firm" ? null : matterId,
      created_by: me.user.id,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Announcement posted");
    setOpen(false); setTitle(""); setBody(""); setMatterId("firm");
    qc.invalidateQueries({ queryKey: ["announcements"] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Megaphone className="mr-2 h-4 w-4" />New announcement</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New announcement</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="ann-title">Title</Label>
            <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Office closed for Heroes' Day" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ann-body">Message</Label>
            <Textarea id="ann-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the update your clients should see…" />
          </div>
          <div className="space-y-1.5">
            <Label>Send to</Label>
            <Select value={matterId} onValueChange={setMatterId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="firm">All clients (firm-wide)</SelectItem>
                {(matters ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}><span className="tabular mr-1 text-muted-foreground">{m.matter_number}</span>{m.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Matter announcements are visible only to clients on that matter.</p>
          </div>
          <Button className="w-full" onClick={post} disabled={saving || !title.trim() || !body.trim()}>
            {saving ? "Posting…" : "Post announcement"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AnnouncementsPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const canCompose = isInternalRole(me?.role);

  const { data: items } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () =>
      (await supabase
        .from("announcements")
        .select("*, author:profiles(full_name), matter:matters(title, matter_number)")
        .order("created_at", { ascending: false })).data as Announcement[] ?? [],
  });

  async function remove(a: Announcement) {
    const { error } = await supabase.from("announcements").delete().eq("id", a.id);
    if (error) toast.error(error.message);
    else { toast.success("Announcement removed"); qc.invalidateQueries({ queryKey: ["announcements"] }); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Announcements" actions={canCompose ? <NewAnnouncementDialog /> : undefined} />
      {!items?.length ? (
        <EmptyState
          title="No announcements yet"
          body={canCompose ? "Post an update for all clients, or for the clients of a specific matter." : "Updates from the firm will appear here."}
        />
      ) : (
        <ul className="space-y-4">
          {items.map((a) => (
            <li key={a.id} className="rounded-lg border bg-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="flex-1 text-base font-medium">{a.title}</h3>
                {a.matter ? (
                  <Badge variant="secondary">
                    <Link to="/matters/$id" params={{ id: a.matter_id! }} className="hover:underline">
                      <span className="tabular mr-1">{a.matter.matter_number}</span>{a.matter.title}
                    </Link>
                  </Badge>
                ) : (
                  <Badge>Firm-wide</Badge>
                )}
                {(canCompose && (a.created_by === me?.user.id || isPartner(me?.role))) && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="Delete announcement" onClick={() => remove(a)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                {a.author?.full_name ?? "The firm"} · {format(parseISO(a.created_at), "d MMM yyyy, HH:mm")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
