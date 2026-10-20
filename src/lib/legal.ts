import type { Database } from "@/integrations/supabase/types";

export type MatterStatus = Database["public"]["Enums"]["matter_status"];
export type PracticeArea = Database["public"]["Enums"]["practice_area"];
export type AppRole = Database["public"]["Enums"]["app_role"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskPriority = Database["public"]["Enums"]["task_priority"];
export type EventType = Database["public"]["Enums"]["event_type"];

export const MATTER_STATUSES: { value: MatterStatus; label: string; variant: "intake" | "active" | "hold" | "closed" }[] = [
  { value: "intake", label: "Intake", variant: "intake" },
  { value: "active", label: "Active", variant: "active" },
  { value: "on_hold", label: "On hold", variant: "hold" },
  { value: "closed", label: "Closed", variant: "closed" },
];

export const PRACTICE_AREAS: { value: PracticeArea; label: string }[] = [
  { value: "litigation", label: "Litigation" },
  { value: "conveyancing", label: "Conveyancing" },
  { value: "corporate", label: "Corporate" },
  { value: "family", label: "Family" },
  { value: "labour", label: "Labour" },
  { value: "criminal", label: "Criminal" },
  { value: "other", label: "Other" },
];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Partner / Admin",
  lawyer: "Lawyer",
  staff: "Paralegal / Staff",
  client: "Client",
};

export const EVENT_LABELS: Record<EventType, string> = {
  court_date: "Court date",
  hearing: "Hearing",
  meeting: "Meeting",
  filing_deadline: "Filing deadline",
  other: "Other",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  waiting: "Waiting",
  done: "Done",
};

export function statusMeta(s: MatterStatus) {
  return MATTER_STATUSES.find((x) => x.value === s)!;
}
export function areaLabel(a: PracticeArea) {
  return PRACTICE_AREAS.find((x) => x.value === a)?.label ?? a;
}

/** A deadline is urgent when it falls within the next 48 hours. */
export function isUrgent(date: string | Date, now: Date = new Date()) {
  const diff = new Date(date).getTime() - now.getTime();
  return diff >= 0 && diff < 48 * 3600 * 1000;
}
