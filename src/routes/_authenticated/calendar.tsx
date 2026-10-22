import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, isSameDay, parseISO, addDays, isToday, isTomorrow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { EVENT_LABELS, isDeadlineType, isUrgent, type EventType } from "@/lib/legal";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [{ title: "Calendar — Docket" }, { name: "description", content: "Court dates, deadlines, hearings and consultations." }] }),
  component: CalendarPage,
});

type EventRow = {
  id: string; title: string; type: EventType; starts_at: string; ends_at: string | null; location: string | null;
  matter_id: string | null; inquiry_id: string | null; entered_by: string | null; confirmed_by: string | null; filed_at: string | null;
  matter?: { title: string; matter_number: string | null } | null;
};

function CalendarPage() {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const { data: events } = useQuery({
    queryKey: ["calendar-events"],
    queryFn: async () => {
      const from = addDays(new Date(), -7).toISOString();
      const to = addDays(new Date(), 31).toISOString();
      const { data } = await supabase.from("events")
        .select("*, matter:matters(title, matter_number)")
        .gte("starts_at", from).lte("starts_at", to)
        .order("starts_at");
      return (data ?? []) as EventRow[];
    },
  });

  const rows = (events ?? []).filter((e) => typeFilter === "all" || e.type === typeFilter);
  const days = new Map<string, EventRow[]>();
  for (const e of rows) {
    const key = e.starts_at.slice(0, 10);
    days.set(key, [...(days.get(key) ?? []), e]);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Calendar"
        actions={
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {(Object.keys(EVENT_LABELS) as EventType[]).map((t) => <SelectItem key={t} value={t}>{EVENT_LABELS[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="Nothing scheduled" body="Court dates, deadlines, hearings and consultations will appear here." />
      ) : (
        <div className="space-y-6">
          {[...days.entries()].map(([day, items]) => {
            const d = parseISO(day);
            return (
              <section key={day}>
                <h2 className="eyebrow mb-2">
                  {isToday(d) ? "Today — " : isTomorrow(d) ? "Tomorrow — " : ""}{format(d, "EEEE d MMMM")}
                </h2>
                <ul className="divide-y rounded-lg border bg-card">
                  {items.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-4 px-4 py-3 text-sm">
                      <span className={"tabular w-14 text-xs " + (isUrgent(e.starts_at) && isDeadlineType(e.type) ? "font-semibold text-destructive" : "text-muted-foreground")}>
                        {format(parseISO(e.starts_at), "HH:mm")}
                      </span>
                      <span className="min-w-0 flex-1">
                        {e.title}
                        {e.matter && (
                          <Link to="/matters/$id" params={{ id: e.matter_id! }} className="ml-2 text-xs text-muted-foreground hover:underline">
                            <span className="tabular">{e.matter.matter_number}</span> {e.matter.title}
                          </Link>
                        )}
                      </span>
                      {isDeadlineType(e.type) && !e.filed_at && (
                        <Badge variant={e.confirmed_by ? "quiet" : "hold"}>{e.confirmed_by ? "Confirmed" : "Unconfirmed"}</Badge>
                      )}
                      {e.filed_at && <Badge variant="closed">Filed</Badge>}
                      {e.location && <span className="hidden text-xs text-muted-foreground lg:block">{e.location}</span>}
                      <Badge variant="quiet">{EVENT_LABELS[e.type]}</Badge>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
