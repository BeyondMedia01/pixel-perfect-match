import { describe, expect, it } from "vitest";
import {
  ALERT_CATEGORIES,
  buildStaffAlerts,
  firmToday,
  DEFAULT_CHANNEL_PREFS,
  normaliseWhatsAppNumber,
  preferencesForChannel,
} from "@/lib/notifications";

const base = {
  inquiries: [],
  tasks: [],
  events: [],
  userId: "staff-1",
  today: "2026-10-26",
  now: new Date("2026-10-26T08:00:00Z"),
};
const allOn = Object.fromEntries(ALERT_CATEGORIES.map((c) => [c.key, true]));
const allOff = Object.fromEntries(ALERT_CATEGORIES.map((c) => [c.key, false]));
describe("staff notification rules", () => {
  it("keeps in-app alerts on by default and external channels opt-in", () => {
    expect(preferencesForChannel(DEFAULT_CHANNEL_PREFS, "in_app")).toEqual(allOn);
    for (const channel of ["email", "whatsapp"] as const) {
      expect(preferencesForChannel(DEFAULT_CHANNEL_PREFS, channel)).toEqual(allOff);
    }
  });
  it("stores alert choices independently across all three channels", () => {
    const prefs = {
      ...DEFAULT_CHANNEL_PREFS,
      new_inquiries: false,
      email_new_inquiries: true,
      whatsapp_tasks_due_today: true,
    };
    expect(preferencesForChannel(prefs, "in_app").new_inquiries).toBe(false);
    expect(preferencesForChannel(prefs, "email")).toEqual({ ...allOff, new_inquiries: true });
    expect(preferencesForChannel(prefs, "whatsapp")).toEqual({ ...allOff, tasks_due_today: true });
  });
  it("alerts for new inquiries only", () => {
    expect(
      buildStaffAlerts({
        ...base,
        inquiries: [
          { id: "new", name: "Prospect", status: "new" },
          { id: "booked", name: "Booked", status: "consult" },
        ],
      }).map((a) => a.id),
    ).toEqual(["new"]);
  });
  it("alerts for own unfinished tasks due today, not tomorrow or completed tasks", () => {
    const tasks = [
      {
        id: "today",
        title: "File",
        assignee_id: "staff-1",
        due_date: "2026-10-26",
        status: "todo" as const,
      },
      {
        id: "tomorrow",
        title: "File",
        assignee_id: "staff-1",
        due_date: "2026-10-27",
        status: "todo" as const,
      },
      {
        id: "done",
        title: "File",
        assignee_id: "staff-1",
        due_date: "2026-10-26",
        status: "done" as const,
      },
      {
        id: "other",
        title: "File",
        assignee_id: "staff-2",
        due_date: "2026-10-26",
        status: "todo" as const,
      },
    ];
    expect(buildStaffAlerts({ ...base, tasks }).map((a) => a.id)).toEqual(["today"]);
  });
  it("alerts for deadlines awaiting confirmation, not confirmed, filed, or ordinary meetings", () => {
    const deadline = {
      id: "pending",
      title: "File",
      type: "filing_deadline" as const,
      confirmed_by: null,
      filed_at: null,
      matter_id: "matter",
    };
    expect(
      buildStaffAlerts({
        ...base,
        events: [
          deadline,
          { ...deadline, id: "confirmed", confirmed_by: "lawyer" },
          { ...deadline, id: "filed", filed_at: "2026-10-26" },
          { ...deadline, id: "meeting", type: "meeting" },
        ],
      }).map((a) => a.id),
    ).toEqual(["pending"]);
  });
  it("uses the firm's Harare date at UTC day boundaries", () => {
    expect(firmToday(new Date("2026-10-25T23:00:00Z"))).toBe("2026-10-26");
  });
  it("leaves out alert types the person has switched off", () => {
    const all = {
      ...base,
      inquiries: [{ id: "new", name: "Prospect", status: "new" as const }],
      tasks: [
        {
          id: "today",
          title: "File",
          assignee_id: "staff-1",
          due_date: "2026-10-26",
          status: "todo" as const,
        },
      ],
      events: [
        {
          id: "pending",
          title: "File",
          type: "filing_deadline" as const,
          confirmed_by: null,
          filed_at: null,
          matter_id: "matter",
        },
      ],
    };
    expect(buildStaffAlerts(all).map((a) => a.kind)).toEqual(["inquiry", "task", "deadline"]);
    expect(
      buildStaffAlerts({
        ...all,
        prefs: { new_inquiries: false, tasks_due_today: true, unconfirmed_deadlines: false },
      }).map((a) => a.kind),
    ).toEqual(["task"]);
  });
  it("alerts for tasks a colleague assigned this week, not self-made, old or finished ones", () => {
    const task = {
      id: "given",
      title: "Draft",
      assignee_id: "staff-1",
      due_date: null,
      status: "todo" as const,
      created_by: "partner",
      created_at: "2026-10-25T10:00:00Z",
    };
    expect(
      buildStaffAlerts({
        ...base,
        tasks: [
          task,
          { ...task, id: "own", created_by: "staff-1" },
          { ...task, id: "old", created_at: "2026-10-01T10:00:00Z" },
          { ...task, id: "done", status: "done" as const },
          { ...task, id: "theirs", assignee_id: "staff-2" },
        ],
      }).map((a) => a.key),
    ).toEqual(["assigned:given"]);
  });
  it("alerts for court dates and hearings in the next 24 hours, keyed by start time", () => {
    const ev = {
      id: "h1",
      title: "Hearing",
      type: "hearing" as const,
      confirmed_by: "lawyer",
      filed_at: null,
      matter_id: "m1",
      starts_at: "2026-10-27T07:00:00Z",
    };
    const alerts = buildStaffAlerts({
      ...base,
      events: [
        ev,
        { ...ev, id: "later", starts_at: "2026-10-28T09:00:00Z" },
        { ...ev, id: "past", starts_at: "2026-10-26T07:00:00Z" },
        { ...ev, id: "meeting", type: "meeting" as const },
      ],
    });
    expect(alerts.map((a) => a.key)).toEqual(["hearing:h1:2026-10-27T07:00:00Z"]);
    expect(alerts[0]!.detail).toMatch(/^Hearing /);
    expect(alerts[0]!.matterId).toBe("m1");
  });
  it("alerts for recent announcements by colleagues, not your own", () => {
    const a = {
      id: "a1",
      title: "Office closed Friday",
      created_by: "partner",
      created_at: "2026-10-24T08:00:00Z",
      matter_id: null,
    };
    expect(
      buildStaffAlerts({
        ...base,
        announcements: [
          a,
          { ...a, id: "mine", created_by: "staff-1" },
          { ...a, id: "old", created_at: "2026-09-01T08:00:00Z" },
        ],
      }).map((x) => [x.key, x.detail]),
    ).toEqual([["announcement:a1", "Firm announcement"]]);
    expect(
      buildStaffAlerts({ ...base, announcements: [a], prefs: { announcements: false } }),
    ).toEqual([]);
  });
  it("normalises WhatsApp numbers to international format", () => {
    expect(normaliseWhatsAppNumber("+263 77 123 4567")).toBe("+263771234567");
    expect(normaliseWhatsAppNumber("00263-77-123-4567")).toBe("+263771234567");
    expect(normaliseWhatsAppNumber("0771234567")).toBeNull();
    expect(normaliseWhatsAppNumber("+26")).toBeNull();
    expect(normaliseWhatsAppNumber("  ")).toBeNull();
  });
  it("treats alert types with no saved choice as on, so new types reach existing staff", () => {
    expect(
      buildStaffAlerts({
        ...base,
        inquiries: [{ id: "new", name: "Prospect", status: "new" as const }],
        prefs: {},
      }).map((a) => a.kind),
    ).toEqual(["inquiry"]);
  });
});
