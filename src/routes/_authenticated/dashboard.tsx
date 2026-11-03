import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useMe, isPartner } from "@/lib/auth";
import { EVENT_LABELS, isUrgent, statusMeta } from "@/lib/legal";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Acta" }, { name: "description", content: "Today's court dates, deadlines and tasks." }, { property: "og:title", content: "Dashboard — Acta" }, { property: "og:description", content: "Today's court dates, deadlines and tasks." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: me } = useMe();
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const now = new Date();
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      const week = new Date(start); week.setDate(week.getDate() + 8);
      const today = format(now, "yyyy-MM-dd");
      const [events, tasks, matters] = await Promise.all([
        supabase.from("events").select("*, matters(id, title, matter_number)").gte("starts_at", start.toISOString()).lt("starts_at", week.toISOString()).order("starts_at"),
        supabase.from("tasks").select("*, matters(id, title, matter_number)").neq("status", "done").lte("due_date", today).order("due_date"),
        supabase.from("matters").select("id, title, matter_number, status, updated_at, clients(name)").order("updated_at", { ascending: false }).limit(6),
      ]);
      return { events: events.data ?? [], tasks: tasks.data ?? [], matters: matters.data ?? [] };
    },
  });
  const todayStr = new Date().toDateString();
  const todayEvents = data?.events.filter((e) => new Date(e.starts_at).toDateString() === todayStr) ?? [];
  const upcoming = data?.events.filter((e) => new Date(e.starts_at).toDateString() !== todayStr) ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow={format(new Date(), "EEEE, d MMMM yyyy")} title={`Good day${me?.profile?.full_name ? ", " + me.profile.full_name.split(" ")[0] : ""}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border bg-card p-5 lg:col-span-2">
          <h2 className="eyebrow mb-4">Today</h2>
          {todayEvents.length === 0 && (data?.tasks.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing scheduled today. A good day to catch up on drafting.</p>
          ) : (
            <ul className="divide-y">
              {todayEvents.map((e) => (
                <li key={e.id} className="flex items-center gap-4 py-3">
                  <span className="tabular w-14 text-sm">{format(new Date(e.starts_at), "HH:mm")}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{e.title}</div>
                    {e.matters && <Link to="/matters/$id" params={{ id: e.matters.id }} className="text-xs text-muted-foreground hover:underline">{e.matters.matter_number} · {e.matters.title}</Link>}
                  </div>
                  <Badge variant="quiet">{EVENT_LABELS[e.type]}</Badge>
                </li>
              ))}
              {data?.tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-4 py-3">
                  <span className="w-14 text-xs text-muted-foreground">Task</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{t.title}</div>
                    {t.matters && <Link to="/matters/$id" params={{ id: t.matters.id }} className="text-xs text-muted-foreground hover:underline">{t.matters.matter_number}</Link>}
                  </div>
                  <Badge variant={t.priority === "urgent" || t.priority === "high" ? "urgent" : "quiet"}>{t.priority}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-lg border bg-card p-5">
          <h2 className="eyebrow mb-4">{isPartner(me?.role) ? "Firm snapshot" : "This week"}</h2>
          <div className="space-y-4">
            <Stat label="Unbilled hours this week" value="—" hint="Available once time tracking is added" />
            {isPartner(me?.role) && <Stat label="Revenue this month" value="—" hint="Available once billing is added" />}
            <Stat label="Deadlines in 7 days" value={String(upcoming.length)} />
          </div>
        </section>
        <section className="rounded-lg border bg-card p-5 lg:col-span-2">
          <h2 className="eyebrow mb-4">Next 7 days</h2>
          {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">No upcoming dates.</p> : (
            <ul className="divide-y">
              {upcoming.map((e) => {
                const urgent = isUrgent(e.starts_at);
                return (
                  <li key={e.id} className={cn("flex items-center gap-4 py-3", urgent && "-mx-2 rounded-md bg-destructive/5 px-2")}>
                    <span className={cn("tabular w-24 text-sm", urgent && "text-destructive")}>{format(new Date(e.starts_at), "EEE d MMM")}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{e.title}</div>
                      {e.matters && <Link to="/matters/$id" params={{ id: e.matters.id }} className="text-xs text-muted-foreground hover:underline">{e.matters.matter_number} · {e.matters.title}</Link>}
                    </div>
                    {urgent ? <Badge variant="urgent">Under 48h</Badge> : <Badge variant="quiet">{EVENT_LABELS[e.type]}</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="rounded-lg border bg-card p-5">
          <h2 className="eyebrow mb-4">Recently updated</h2>
          <ul className="space-y-3">
            {data?.matters.map((m) => (
              <li key={m.id}>
                <Link to="/matters/$id" params={{ id: m.id }} className="block hover:underline">
                  <div className="text-sm">{m.title}</div>
                </Link>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={statusMeta(m.status).variant}>{statusMeta(m.status).label}</Badge>
                  {formatDistanceToNow(new Date(m.updated_at), { addSuffix: true })}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="tabular text-2xl">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
