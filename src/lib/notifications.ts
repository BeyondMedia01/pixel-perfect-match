import type { Database } from "@/integrations/supabase/types";
type Tables = Database["public"]["Tables"];
export type StaffAlert = { key: string; kind: "inquiry" | "task" | "deadline"; id: string; title: string; detail: string; matterId?: string | null };

export function firmToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Harare", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function buildStaffAlerts({ inquiries, tasks, events, userId, today }: {
  inquiries: Pick<Tables["inquiries"]["Row"], "id" | "name" | "status">[];
  tasks: Pick<Tables["tasks"]["Row"], "id" | "title" | "assignee_id" | "due_date" | "status">[];
  events: Pick<Tables["events"]["Row"], "id" | "title" | "type" | "confirmed_by" | "filed_at" | "matter_id">[];
  userId: string; today: string;
}): StaffAlert[] {
  return [
    ...inquiries.filter(i => i.status === "new").map(i => ({ key: `inquiry:${i.id}`, kind: "inquiry" as const, id: i.id, title: i.name, detail: "New inquiry" })),
    ...tasks.filter(t => t.assignee_id === userId && t.due_date === today && t.status !== "done").map(t => ({ key: `task:${t.id}:${today}`, kind: "task" as const, id: t.id, title: t.title, detail: "Your task is due today" })),
    ...events.filter(e => ["court_date", "filing_deadline"].includes(e.type) && !e.confirmed_by && !e.filed_at).map(e => ({ key: `deadline:${e.id}`, kind: "deadline" as const, id: e.id, title: e.title, detail: "Awaiting lawyer confirmation", matterId: e.matter_id })),
  ];
}