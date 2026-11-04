import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isTomorrow,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Rss } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, isInternalRole } from "@/lib/auth";
import { EVENT_LABELS, isDeadlineType, isUrgent, type EventType } from "@/lib/legal";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { AddToCalendar } from "@/components/add-to-calendar";
import { EventDialog, type EditableEvent } from "@/components/event-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — Acta" },
      { name: "description", content: "Court dates, deadlines, hearings and consultations." },
      { property: "og:title", content: "Calendar — Acta" },
      {
        property: "og:description",
        content: "Court dates, deadlines, hearings and consultations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CalendarPage,
});

type EventRow = EditableEvent & {
  entered_by: string | null;
  filed_at: string | null;
  matter?: { title: string; matter_number: string | null } | null;
};

const TYPE_DOT: Record<EventType, string> = {
  court_date: "bg-destructive",
  filing_deadline: "bg-warning",
  hearing: "bg-signal",
  meeting: "bg-primary",
  other: "bg-muted-foreground",
};

function calendarItem(e: EventRow) {
  return {
    uid: `event-${e.id}`,
    title: e.title,
    description: e.matter ? `${e.matter.matter_number ?? ""} ${e.matter.title}`.trim() : null,
    location: e.location,
    start: e.starts_at,
    end: e.ends_at,
  };
}

function CalendarPage() {
  const { data: me } = useMe();
  const canEdit = isInternalRole(me?.role);
  const [view, setView] = useState<"month" | "list">("month");
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [creatingOn, setCreatingOn] = useState<Date | null>(null);

  const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
  const range =
    view === "month"
      ? { from: gridStart, to: addDays(gridEnd, 1) }
      : { from: addDays(new Date(), -7), to: addDays(new Date(), 60) };

  const { data: events } = useQuery({
    queryKey: ["calendar-events", view, range.from.toDateString()],
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("*, matter:matters(title, matter_number)")
        .gte("starts_at", range.from.toISOString())
        .lt("starts_at", range.to.toISOString())
        .order("starts_at");
      return (data ?? []) as EventRow[];
    },
  });

  const rows = (events ?? []).filter((e) => typeFilter === "all" || e.type === typeFilter);
  const byDay = useMemo(() => {
    const m = new Map<string, EventRow[]>();
    for (const e of rows) {
      const key = format(parseISO(e.starts_at), "yyyy-MM-dd");
      m.set(key, [...(m.get(key) ?? []), e]);
    }
    return m;
  }, [rows]);

  const dayRows = (d: Date) => byDay.get(format(d, "yyyy-MM-dd")) ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Calendar"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(v) => v && setView(v as "month" | "list")}
            >
              <ToggleGroupItem value="month">Month</ToggleGroupItem>
              <ToggleGroupItem value="list">List</ToggleGroupItem>
            </ToggleGroup>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44" aria-label="Filter by type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {(Object.keys(EVENT_LABELS) as EventType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {EVENT_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canEdit && (
              <Button variant="outline" asChild>
                <Link to="/settings" hash="calendar-sync">
                  <Rss className="mr-1.5 h-4 w-4" />
                  Sync to my calendar
                </Link>
              </Button>
            )}
            {canEdit && (
              <Button onClick={() => setCreatingOn(view === "month" ? selectedDay : new Date())}>
                <Plus className="mr-1 h-4 w-4" />
                New event
              </Button>
            )}
          </div>
        }
      />

      {view === "month" ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <section className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-lg font-semibold">{format(cursor, "MMMM yyyy")}</h2>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Previous month"
                  onClick={() => setCursor((c) => addMonths(c, -1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCursor(startOfMonth(new Date()));
                    setSelectedDay(new Date());
                  }}
                >
                  Today
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Next month"
                  onClick={() => setCursor((c) => addMonths(c, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-7 border-b text-center text-xs text-muted-foreground">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {eachDayOfInterval({ start: gridStart, end: gridEnd }).map((d) => {
                const items = dayRows(d);
                const selected = isSameDay(d, selectedDay);
                return (
                  <button
                    key={d.toISOString()}
                    type="button"
                    onClick={() => setSelectedDay(d)}
                    onDoubleClick={() => canEdit && setCreatingOn(d)}
                    aria-label={`${format(d, "EEEE d MMMM")}, ${items.length} ${items.length === 1 ? "event" : "events"}`}
                    aria-pressed={selected}
                    className={
                      "flex min-h-24 flex-col items-stretch justify-start border-b border-r p-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring " +
                      (isSameMonth(d, cursor) ? "" : "bg-muted/40 text-muted-foreground ") +
                      (selected ? "bg-accent " : "")
                    }
                  >
                    <span
                      className={
                        "tabular inline-flex h-6 w-6 items-center justify-center rounded-full text-xs " +
                        (isToday(d) ? "bg-primary font-semibold text-primary-foreground" : "")
                      }
                    >
                      {format(d, "d")}
                    </span>
                    <ul className="mt-1 space-y-0.5">
                      {items.slice(0, 3).map((e) => (
                        <li
                          key={e.id}
                          className="flex items-center gap-1 truncate text-[11px] leading-4"
                        >
                          <span
                            className={"h-1.5 w-1.5 shrink-0 rounded-full " + TYPE_DOT[e.type]}
                            aria-hidden
                          />
                          <span className="truncate">
                            {format(parseISO(e.starts_at), "HH:mm")} {e.title}
                          </span>
                        </li>
                      ))}
                      {items.length > 3 && (
                        <li className="text-[11px] text-muted-foreground">
                          +{items.length - 3} more
                        </li>
                      )}
                    </ul>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="eyebrow">
                {isToday(selectedDay) ? "Today — " : isTomorrow(selectedDay) ? "Tomorrow — " : ""}
                {format(selectedDay, "EEEE d MMMM")}
              </h2>
              {canEdit && (
                <Button variant="ghost" size="sm" onClick={() => setCreatingOn(selectedDay)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add
                </Button>
              )}
            </div>
            {dayRows(selectedDay).length === 0 ? (
              <p className="rounded-lg border border-dashed bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                Nothing scheduled.
              </p>
            ) : (
              <EventList
                rows={dayRows(selectedDay)}
                onOpen={canEdit ? setEditing : undefined}
                compact
              />
            )}
          </section>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing scheduled"
          body="Court dates, deadlines, hearings and consultations for the next two months will appear here."
        />
      ) : (
        <div className="space-y-6">
          {[...byDay.entries()].map(([day, items]) => {
            const d = parseISO(day);
            return (
              <section key={day}>
                <h2 className="eyebrow mb-2">
                  {isToday(d) ? "Today — " : isTomorrow(d) ? "Tomorrow — " : ""}
                  {format(d, "EEEE d MMMM")}
                </h2>
                <EventList rows={items} onOpen={canEdit ? setEditing : undefined} />
              </section>
            );
          })}
        </div>
      )}

      <EventDialog
        open={!!creatingOn}
        onOpenChange={(o) => !o && setCreatingOn(null)}
        defaultDate={creatingOn}
      />
      <EventDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} event={editing} />
    </div>
  );
}

function EventList({
  rows,
  onOpen,
  compact,
}: {
  rows: EventRow[];
  onOpen?: ((e: EventRow) => void) | undefined;
  compact?: boolean;
}) {
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {rows.map((e) => (
        <li
          key={e.id}
          className={
            "flex gap-x-4 gap-y-1 px-4 py-3 text-sm " +
            (compact ? "items-start" : "flex-wrap items-center")
          }
        >
          <span
            className={
              "tabular w-12 shrink-0 pt-0.5 text-xs " +
              (isUrgent(e.starts_at) && isDeadlineType(e.type)
                ? "font-semibold text-destructive"
                : "text-muted-foreground")
            }
          >
            {format(parseISO(e.starts_at), "HH:mm")}
          </span>
          <span className="min-w-0 flex-1">
            {onOpen ? (
              <button
                type="button"
                onClick={() => onOpen(e)}
                className="text-left font-medium hover:underline"
              >
                {e.title}
              </button>
            ) : (
              <span className="font-medium">{e.title}</span>
            )}
            {e.matter && (
              <Link
                to="/matters/$id"
                params={{ id: e.matter_id! }}
                className={
                  "text-xs text-muted-foreground hover:underline " + (compact ? "block" : "ml-2")
                }
              >
                <span className="tabular">{e.matter.matter_number}</span> {e.matter.title}
              </Link>
            )}
            {compact && e.location && (
              <span className="block text-xs text-muted-foreground">{e.location}</span>
            )}
            {compact && isDeadlineType(e.type) && (
              <span
                className={
                  "block text-xs " +
                  (e.filed_at || e.confirmed_by ? "text-muted-foreground" : "text-warning")
                }
              >
                {EVENT_LABELS[e.type]} ·{" "}
                {e.filed_at ? "Filed" : e.confirmed_by ? "Confirmed" : "Unconfirmed"}
              </span>
            )}
          </span>
          {!compact && isDeadlineType(e.type) && !e.filed_at && (
            <Badge variant={e.confirmed_by ? "quiet" : "hold"}>
              {e.confirmed_by ? "Confirmed" : "Unconfirmed"}
            </Badge>
          )}
          {!compact && e.filed_at && <Badge variant="closed">Filed</Badge>}
          {!compact && e.location && (
            <span className="hidden text-xs text-muted-foreground lg:block">{e.location}</span>
          )}
          {!compact && <Badge variant="quiet">{EVENT_LABELS[e.type]}</Badge>}
          <AddToCalendar item={calendarItem(e)} />
        </li>
      ))}
    </ul>
  );
}
