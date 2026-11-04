import { describe, expect, it } from "vitest";
import { buildIcs, googleCalendarUrl, icsEscape, icsFold, outlookCalendarUrl } from "@/lib/ics";

const now = new Date("2026-11-03T08:00:00Z");

describe("calendar files", () => {
  it("writes a timed event with escaped text", () => {
    const ics = buildIcs(
      [
        {
          uid: "event-1",
          title: "Hearing; room 4, floor 2",
          location: "High Court\nHarare",
          start: "2026-11-10T07:00:00Z",
          end: "2026-11-10T08:30:00Z",
        },
      ],
      { now },
    );
    expect(ics).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0");
    expect(ics).toContain("UID:event-1@acta");
    expect(ics).toContain("DTSTART:20261110T070000Z\r\nDTEND:20261110T083000Z");
    expect(ics).toContain("SUMMARY:Hearing\\; room 4\\, floor 2");
    expect(ics).toContain("LOCATION:High Court\\nHarare");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("gives events without an end one hour", () => {
    const ics = buildIcs([{ uid: "e", title: "Call", start: "2026-11-10T07:00:00Z" }], { now });
    expect(ics).toContain("DTEND:20261110T080000Z");
  });

  it("writes tasks as all-day items ending the next day", () => {
    const ics = buildIcs([{ uid: "task-1", title: "Task: File plea", allDayDate: "2026-12-31" }], {
      now,
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101");
  });

  it("names subscription feeds and asks for hourly refresh", () => {
    const ics = buildIcs([], { name: "Acta — Tendai", now });
    expect(ics).toContain("X-WR-CALNAME:Acta — Tendai");
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
  });

  it("folds long lines at 75 bytes", () => {
    const folded = icsFold("DESCRIPTION:" + "x".repeat(200));
    for (const line of folded.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe("DESCRIPTION:" + "x".repeat(200));
  });

  it("escapes backslashes first", () => {
    expect(icsEscape("a\\b")).toBe("a\\\\b");
  });
});

describe("add-to-calendar links", () => {
  const item = {
    uid: "e",
    title: "Pre-trial conference",
    location: "High Court",
    start: "2026-11-10T07:00:00Z",
  };
  it("fills in Google Calendar", () => {
    const url = new URL(googleCalendarUrl(item));
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("text")).toBe("Pre-trial conference");
    expect(url.searchParams.get("dates")).toBe("20261110T070000Z/20261110T080000Z");
  });
  it("fills in Outlook", () => {
    const url = new URL(outlookCalendarUrl(item));
    expect(url.hostname).toBe("outlook.office.com");
    expect(url.searchParams.get("startdt")).toBe("2026-11-10T07:00:00.000Z");
    expect(new URL(outlookCalendarUrl(item, false)).hostname).toBe("outlook.live.com");
  });
});
