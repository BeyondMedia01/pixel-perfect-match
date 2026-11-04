import { describe, expect, it } from "vitest";
import {
  buildStaffAlerts,
  firmToday,
  DEFAULT_CHANNEL_PREFS,
  preferencesForChannel,
} from "@/lib/notifications";

const base = { inquiries: [], tasks: [], events: [], userId: "staff-1", today: "2026-10-26" };
describe("staff notification rules", () => {
  it("keeps in-app alerts on by default and external channels opt-in", () => {
    expect(preferencesForChannel(DEFAULT_CHANNEL_PREFS, "in_app")).toEqual({
      new_inquiries: true,
      tasks_due_today: true,
      unconfirmed_deadlines: true,
    });
    for (const channel of ["email", "whatsapp"] as const) {
      expect(preferencesForChannel(DEFAULT_CHANNEL_PREFS, channel)).toEqual({
        new_inquiries: false,
        tasks_due_today: false,
        unconfirmed_deadlines: false,
      });
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
    expect(preferencesForChannel(prefs, "email")).toEqual({
      new_inquiries: true,
      tasks_due_today: false,
      unconfirmed_deadlines: false,
    });
    expect(preferencesForChannel(prefs, "whatsapp")).toEqual({
      new_inquiries: false,
      tasks_due_today: true,
      unconfirmed_deadlines: false,
    });
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
});
