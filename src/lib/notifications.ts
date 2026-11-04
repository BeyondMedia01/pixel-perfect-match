import type { Database } from "@/integrations/supabase/types";
type Tables = Database["public"]["Tables"];

export type AlertKind = "inquiry" | "assigned" | "task" | "hearing" | "deadline" | "announcement";
export type StaffAlert = {
  key: string;
  kind: AlertKind;
  id: string;
  title: string;
  detail: string;
  matterId?: string | null;
};

export function firmToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Harare",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Every alert a staff member can choose to receive, in the order shown in settings. */
export const ALERT_CATEGORIES = [
  {
    key: "new_inquiries",
    label: "New inquiries",
    detail: "A prospective client sends an inquiry.",
    internalOnly: false,
  },
  {
    key: "tasks_assigned",
    label: "Tasks assigned to me",
    detail: "A colleague gives you a task.",
    internalOnly: true,
  },
  {
    key: "tasks_due_today",
    label: "My tasks due today",
    detail: "Your unfinished tasks due today.",
    internalOnly: true,
  },
  {
    key: "upcoming_hearings",
    label: "Court dates and hearings",
    detail: "A court date or hearing on a matter you can see starts within 24 hours.",
    internalOnly: true,
  },
  {
    key: "unconfirmed_deadlines",
    label: "Deadlines awaiting confirmation",
    detail: "Court dates and filing deadlines a lawyer hasn't confirmed yet.",
    internalOnly: true,
  },
  {
    key: "announcements",
    label: "Announcements",
    detail: "A colleague posts a firm-wide or matter announcement.",
    internalOnly: false,
  },
] as const;

export type AlertCategory = (typeof ALERT_CATEGORIES)[number]["key"];
export type NotificationPrefs = Record<AlertCategory, boolean>;
export type NotificationChannel = "in_app" | "email" | "whatsapp";
export type ChannelNotificationPrefs = NotificationPrefs &
  Record<`email_${AlertCategory}` | `whatsapp_${AlertCategory}`, boolean>;

const categoryKeys = ALERT_CATEGORIES.map((c) => c.key);
const fill = (prefix: string, value: boolean) =>
  Object.fromEntries(categoryKeys.map((k) => [`${prefix}${k}`, value]));

/** In-app alerts are on until switched off; email and WhatsApp are opt-in. */
export const DEFAULT_NOTIFICATION_PREFS = fill("", true) as NotificationPrefs;
export const DEFAULT_CHANNEL_PREFS = {
  ...DEFAULT_NOTIFICATION_PREFS,
  ...fill("email_", false),
  ...fill("whatsapp_", false),
} as ChannelNotificationPrefs;

export function channelPreferenceKey(
  channel: NotificationChannel,
  category: AlertCategory,
): keyof ChannelNotificationPrefs {
  return channel === "in_app" ? category : `${channel}_${category}`;
}

export function preferencesForChannel(
  prefs: ChannelNotificationPrefs,
  channel: NotificationChannel,
): NotificationPrefs {
  return Object.fromEntries(
    categoryKeys.map((k) => [k, prefs[channelPreferenceKey(channel, k)] ?? false]),
  ) as NotificationPrefs;
}

/** International format with country code, e.g. +263771234567. */
export function normaliseWhatsAppNumber(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, "");
  if (!digits) return null;
  const withPlus = digits.startsWith("00") ? `+${digits.slice(2)}` : digits;
  return /^\+[1-9][0-9]{7,14}$/.test(withPlus) ? withPlus : null;
}

export const ASSIGNED_WINDOW_DAYS = 7;
export const ANNOUNCEMENT_WINDOW_DAYS = 14;
export const HEARING_WINDOW_HOURS = 24;
const DAY = 24 * 3600 * 1000;

type AlertEvent = Pick<
  Tables["events"]["Row"],
  "id" | "title" | "type" | "confirmed_by" | "filed_at" | "matter_id"
> &
  Partial<Pick<Tables["events"]["Row"], "starts_at">>;

export function buildStaffAlerts({
  inquiries,
  tasks,
  events,
  announcements = [],
  userId,
  today,
  now = new Date(),
  prefs = DEFAULT_NOTIFICATION_PREFS,
}: {
  inquiries: Pick<Tables["inquiries"]["Row"], "id" | "name" | "status">[];
  tasks: (Pick<Tables["tasks"]["Row"], "id" | "title" | "assignee_id" | "due_date" | "status"> &
    Partial<Pick<Tables["tasks"]["Row"], "created_by" | "created_at">>)[];
  events: AlertEvent[];
  announcements?: Pick<
    Tables["announcements"]["Row"],
    "id" | "title" | "created_by" | "created_at" | "matter_id"
  >[];
  userId: string;
  today: string;
  now?: Date;
  prefs?: Partial<NotificationPrefs>;
}): StaffAlert[] {
  const on = (k: AlertCategory) => prefs[k] ?? DEFAULT_NOTIFICATION_PREFS[k];
  const t = now.getTime();
  const mine = (task: (typeof tasks)[number]) =>
    task.assignee_id === userId && task.status !== "done";
  return [
    ...inquiries
      .filter((i) => on("new_inquiries") && i.status === "new")
      .map((i) => ({
        key: `inquiry:${i.id}`,
        kind: "inquiry" as const,
        id: i.id,
        title: i.name,
        detail: "New inquiry",
      })),
    ...tasks
      .filter(
        (task) =>
          on("tasks_assigned") &&
          mine(task) &&
          !!task.created_by &&
          task.created_by !== userId &&
          !!task.created_at &&
          t - new Date(task.created_at).getTime() <= ASSIGNED_WINDOW_DAYS * DAY,
      )
      .map((task) => ({
        key: `assigned:${task.id}`,
        kind: "assigned" as const,
        id: task.id,
        title: task.title,
        detail: "Assigned to you",
      })),
    ...tasks
      .filter((task) => on("tasks_due_today") && mine(task) && task.due_date === today)
      .map((task) => ({
        key: `task:${task.id}:${today}`,
        kind: "task" as const,
        id: task.id,
        title: task.title,
        detail: "Your task is due today",
      })),
    ...events
      .filter((e) => {
        if (!on("upcoming_hearings") || !["court_date", "hearing"].includes(e.type)) return false;
        if (!e.starts_at) return false;
        const start = new Date(e.starts_at).getTime();
        return start >= t && start - t <= HEARING_WINDOW_HOURS * 3600 * 1000;
      })
      .map((e) => ({
        // Includes the time, so a rescheduled hearing alerts again.
        key: `hearing:${e.id}:${e.starts_at}`,
        kind: "hearing" as const,
        id: e.id,
        title: e.title,
        detail: `${e.type === "court_date" ? "Court date" : "Hearing"} ${new Intl.DateTimeFormat(
          "en-GB",
          {
            timeZone: "Africa/Harare",
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
          },
        ).format(new Date(e.starts_at!))}`,
        matterId: e.matter_id,
      })),
    ...events
      .filter(
        (e) =>
          on("unconfirmed_deadlines") &&
          ["court_date", "filing_deadline"].includes(e.type) &&
          !e.confirmed_by &&
          !e.filed_at,
      )
      .map((e) => ({
        key: `deadline:${e.id}`,
        kind: "deadline" as const,
        id: e.id,
        title: e.title,
        detail: "Awaiting lawyer confirmation",
        matterId: e.matter_id,
      })),
    ...announcements
      .filter(
        (a) =>
          on("announcements") &&
          a.created_by !== userId &&
          t - new Date(a.created_at).getTime() <= ANNOUNCEMENT_WINDOW_DAYS * DAY,
      )
      .map((a) => ({
        key: `announcement:${a.id}`,
        kind: "announcement" as const,
        id: a.id,
        title: a.title,
        detail: a.matter_id ? "Matter announcement" : "Firm announcement",
        matterId: a.matter_id,
      })),
  ];
}
