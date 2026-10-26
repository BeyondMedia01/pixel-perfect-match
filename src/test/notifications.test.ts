import { describe, expect, it } from "vitest";
import { buildStaffAlerts, firmToday } from "@/lib/notifications";

const base = { inquiries: [], tasks: [], events: [], userId: "staff-1", today: "2026-10-26" };
describe("staff notification rules", () => {
  it("alerts for new inquiries only", () => {
    expect(buildStaffAlerts({ ...base, inquiries: [{ id: "new", name: "Prospect", status: "new" }, { id: "booked", name: "Booked", status: "consult" }] }).map(a => a.id)).toEqual(["new"]);
  });
  it("alerts for own unfinished tasks due today, not tomorrow or completed tasks", () => {
    const tasks = [
      { id: "today", title: "File", assignee_id: "staff-1", due_date: "2026-10-26", status: "todo" as const },
      { id: "tomorrow", title: "File", assignee_id: "staff-1", due_date: "2026-10-27", status: "todo" as const },
      { id: "done", title: "File", assignee_id: "staff-1", due_date: "2026-10-26", status: "done" as const },
      { id: "other", title: "File", assignee_id: "staff-2", due_date: "2026-10-26", status: "todo" as const },
    ];
    expect(buildStaffAlerts({ ...base, tasks }).map(a => a.id)).toEqual(["today"]);
  });
  it("alerts for deadlines awaiting confirmation, not confirmed, filed, or ordinary meetings", () => {
    const deadline = { id: "pending", title: "File", type: "filing_deadline" as const, confirmed_by: null, filed_at: null, matter_id: "matter" };
    expect(buildStaffAlerts({ ...base, events: [deadline, { ...deadline, id: "confirmed", confirmed_by: "lawyer" }, { ...deadline, id: "filed", filed_at: "2026-10-26" }, { ...deadline, id: "meeting", type: "meeting" }] }).map(a => a.id)).toEqual(["pending"]);
  });
  it("uses the firm's Harare date at UTC day boundaries", () => {
    expect(firmToday(new Date("2026-10-25T23:00:00Z"))).toBe("2026-10-26");
  });
});