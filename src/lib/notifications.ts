import type { Database } from "@/integrations/supabase/types";
type Tables = Database["public"]["Tables"];
export type StaffAlert = { key: string; kind: "inquiry" | "task" | "deadline"; id: string; title: string; detail: string; matterId?: string | null };

export function firmToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Harare", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export type NotificationPrefs = { new_inquiries: boolean; tasks_due_today: boolean; unconfirmed_deadlines: boolean };
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = { new_inquiries: true, tasks_due_today: true, unconfirmed_deadlines: true };

export type NotificationChannel = "in_app" | "email" | "whatsapp";
export type ChannelNotificationPrefs = NotificationPrefs & {
  email_new_inquiries: boolean; email_tasks_due_today: boolean; email_unconfirmed_deadlines: boolean;
  whatsapp_new_inquiries: boolean; whatsapp_tasks_due_today: boolean; whatsapp_unconfirmed_deadlines: boolean;
};
export const DEFAULT_CHANNEL_PREFS: ChannelNotificationPrefs = {
  ...DEFAULT_NOTIFICATION_PREFS,
  email_new_inquiries: false, email_tasks_due_today: false, email_unconfirmed_deadlines: false,
  whatsapp_new_inquiries: false, whatsapp_tasks_due_today: false, whatsapp_unconfirmed_deadlines: false,
};
export function channelPreferenceKey(channel: NotificationChannel, category: keyof NotificationPrefs): keyof ChannelNotificationPrefs {
  return channel === "in_app" ? category : `${channel}_${category}`;
}
export function preferencesForChannel(prefs: ChannelNotificationPrefs, channel: NotificationChannel): NotificationPrefs {
  return {
    new_inquiries: prefs[channelPreferenceKey(channel, "new_inquiries")],
    tasks_due_today: prefs[channelPreferenceKey(channel, "tasks_due_today")],
    unconfirmed_deadlines: prefs[channelPreferenceKey(channel, "unconfirmed_deadlines")],
  };
}

export function buildStaffAlerts({ inquiries, tasks, events, userId, today, prefs = DEFAULT_NOTIFICATION_PREFS }: {
  inquiries: Pick<Tables["inquiries"]["Row"], "id" | "name" | "status">[];
  tasks: Pick<Tables["tasks"]["Row"], "id" | "title" | "assignee_id" | "due_date" | "status">[];
  events: Pick<Tables["events"]["Row"], "id" | "title" | "type" | "confirmed_by" | "filed_at" | "matter_id">[];
  userId: string; today: string; prefs?: NotificationPrefs;
}): StaffAlert[] {
  return [
    ...inquiries.filter(i => prefs.new_inquiries && i.status === "new").map(i => ({ key: `inquiry:${i.id}`, kind: "inquiry" as const, id: i.id, title: i.name, detail: "New inquiry" })),
    ...tasks.filter(t => prefs.tasks_due_today && t.assignee_id === userId && t.due_date === today && t.status !== "done").map(t => ({ key: `task:${t.id}:${today}`, kind: "task" as const, id: t.id, title: t.title, detail: "Your task is due today" })),
    ...events.filter(e => prefs.unconfirmed_deadlines && ["court_date", "filing_deadline"].includes(e.type) && !e.confirmed_by && !e.filed_at).map(e => ({ key: `deadline:${e.id}`, kind: "deadline" as const, id: e.id, title: e.title, detail: "Awaiting lawyer confirmation", matterId: e.matter_id })),
  ];
}