import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isPast, parseISO } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/auth";
import { TASK_STATUS_LABELS, type TaskStatus } from "@/lib/legal";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({ meta: [{ title: "Tasks — Docket" }, { name: "description", content: "Your tasks across all matters, grouped by due date." }, { property: "og:title", content: "Tasks — Docket" }, { property: "og:description", content: "Your tasks across all matters, grouped by due date." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: TasksPage,
});

type TaskRow = {
  id: string; title: string; description: string | null; due_date: string | null;
  status: TaskStatus; priority: string; matter_id: string | null; assignee_id: string | null;
  matter?: { title: string; matter_number: string | null } | null;
  assignee?: { full_name: string } | null;
};

function TasksPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [mine, setMine] = useState(true);
  const { data: tasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () =>
      (await supabase.from("tasks").select("*, matter:matters(title, matter_number), assignee:profiles(full_name)").order("due_date", { nullsFirst: false })).data as TaskRow[] ?? [],
  });

  async function setStatus(t: TaskRow, status: TaskStatus) {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", t.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["tasks"] });
  }

  const visible = (tasks ?? []).filter((t) => !mine || t.assignee_id === me?.user.id);
  const today = new Date();
  const groups: { label: string; test: (t: TaskRow) => boolean; tone: string }[] = [
    { label: "Overdue", test: (t) => t.status !== "done" && !!t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)), tone: "text-destructive" },
    { label: "Due today", test: (t) => t.status !== "done" && !!t.due_date && isToday(parseISO(t.due_date)), tone: "text-warning" },
    { label: "Upcoming", test: (t) => t.status !== "done" && (!t.due_date || isPast(parseISO(t.due_date)) === false) && !(t.due_date && (isToday(parseISO(t.due_date)) || (isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date))))), tone: "text-foreground" },
    { label: "Done", test: (t) => t.status === "done", tone: "text-muted-foreground" },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Tasks"
        actions={
          <ToggleGroup type="single" value={mine ? "mine" : "all"} onValueChange={(v) => v && setMine(v === "mine")}>
            <ToggleGroupItem value="mine">Mine</ToggleGroupItem>
            <ToggleGroupItem value="all">Everyone's</ToggleGroupItem>
          </ToggleGroup>
        }
      />
      {!visible.length ? (
        <EmptyState title="No tasks" body={mine ? "Nothing is assigned to you." : "No tasks across the firm yet."} />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => {
            const rows = visible.filter(g.test);
            if (!rows.length) return null;
            return (
              <section key={g.label}>
                <h2 className={"eyebrow mb-3 " + g.tone}>{g.label} ({rows.length})</h2>
                <ul className="divide-y rounded-lg border bg-card">
                  {rows.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-4 px-4 py-3 text-sm">
                      <span className={"min-w-0 flex-1 " + (t.status === "done" ? "text-muted-foreground line-through" : "")}>
                        {t.title}
                        {t.matter && (
                          <Link to="/matters/$id" params={{ id: t.matter_id! }} className="ml-2 text-xs text-muted-foreground hover:underline">
                            <span className="tabular">{t.matter.matter_number}</span> {t.matter.title}
                          </Link>
                        )}
                      </span>
                      <span className="hidden text-xs text-muted-foreground md:block">{t.assignee?.full_name ?? "Unassigned"}</span>
                      <span className={"tabular w-24 text-xs " + (g.label === "Overdue" ? "font-medium text-destructive" : "text-muted-foreground")}>
                        {t.due_date ? format(parseISO(t.due_date), "EEE d MMM") : "No date"}
                      </span>
                      <Select value={t.status} onValueChange={(v) => setStatus(t, v as TaskStatus)}>
                        <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((s) => <SelectItem key={s} value={s}>{TASK_STATUS_LABELS[s]}</SelectItem>)}
                        </SelectContent>
                      </Select>
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
