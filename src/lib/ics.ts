/**
 * Calendar helpers: iCalendar (.ics, RFC 5545) files and feeds, plus
 * "add to Google / Outlook" links. Shared by the browser and the feed route.
 */

export type CalendarItem = {
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  /** Timed items: ISO date-time. */
  start?: string | Date | null;
  end?: string | Date | null;
  /** All-day items (tasks): YYYY-MM-DD. Used when `start` is empty. */
  allDayDate?: string | null;
  updated?: string | Date | null;
};

const DEFAULT_LENGTH_MS = 60 * 60 * 1000;

/** 20261103T143000Z */
export function icsDateTime(d: string | Date): string {
  return new Date(d)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/** 2026-11-03 -> 20261103 */
export function icsDate(day: string): string {
  return day.slice(0, 10).replace(/-/g, "");
}

function nextDay(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Escape text values: backslash, semicolon, comma and newlines. */
export function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold lines longer than 75 octets, as the format requires. */
export function icsFold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (size + n > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function timing(item: CalendarItem): string[] {
  if (item.start) {
    const start = new Date(item.start);
    const end = item.end ? new Date(item.end) : new Date(start.getTime() + DEFAULT_LENGTH_MS);
    return [
      `DTSTART:${icsDateTime(start)}`,
      `DTEND:${icsDateTime(end > start ? end : new Date(start.getTime() + DEFAULT_LENGTH_MS))}`,
    ];
  }
  const day = item.allDayDate!;
  return [`DTSTART;VALUE=DATE:${icsDate(day)}`, `DTEND;VALUE=DATE:${icsDate(nextDay(day))}`];
}

function eventLines(item: CalendarItem, stamp: string): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${item.uid}@acta`,
    `DTSTAMP:${stamp}`,
    ...(item.updated ? [`LAST-MODIFIED:${icsDateTime(item.updated)}`] : []),
    ...timing(item),
    `SUMMARY:${icsEscape(item.title)}`,
    ...(item.description ? [`DESCRIPTION:${icsEscape(item.description)}`] : []),
    ...(item.location ? [`LOCATION:${icsEscape(item.location)}`] : []),
    ...(item.allDayDate && !item.start ? ["TRANSP:TRANSPARENT"] : []),
    "END:VEVENT",
  ];
}

/** A whole calendar: one item for a download, or many for a subscription feed. */
export function buildIcs(items: CalendarItem[], opts: { name?: string; now?: Date } = {}): string {
  const stamp = icsDateTime(opts.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Acta//Case management//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...(opts.name
      ? [
          `X-WR-CALNAME:${icsEscape(opts.name)}`,
          "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
          "X-PUBLISHED-TTL:PT1H",
        ]
      : []),
    ...items.filter((i) => i.start || i.allDayDate).flatMap((i) => eventLines(i, stamp)),
    "END:VCALENDAR",
  ];
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

function googleDates(item: CalendarItem): string {
  if (item.start) {
    const start = new Date(item.start);
    const end = item.end ? new Date(item.end) : new Date(start.getTime() + DEFAULT_LENGTH_MS);
    return `${icsDateTime(start)}/${icsDateTime(end)}`;
  }
  return `${icsDate(item.allDayDate!)}/${icsDate(nextDay(item.allDayDate!))}`;
}

/** Opens Google Calendar with the event filled in. */
export function googleCalendarUrl(item: CalendarItem): string {
  const q = new URLSearchParams({ action: "TEMPLATE", text: item.title, dates: googleDates(item) });
  if (item.description) q.set("details", item.description);
  if (item.location) q.set("location", item.location);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** Opens Outlook on the web with the event filled in. `work` = Microsoft 365, otherwise Outlook.com. */
export function outlookCalendarUrl(item: CalendarItem, work = true): string {
  const start = item.start ? new Date(item.start).toISOString() : `${item.allDayDate}T00:00:00`;
  const end = item.start
    ? new Date(
        item.end ?? new Date(new Date(item.start).getTime() + DEFAULT_LENGTH_MS),
      ).toISOString()
    : `${nextDay(item.allDayDate!)}T00:00:00`;
  const q = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: item.title,
    startdt: start,
    enddt: end,
    allday: item.start ? "false" : "true",
  });
  if (item.description) q.set("body", item.description);
  if (item.location) q.set("location", item.location);
  return `https://${work ? "outlook.office.com" : "outlook.live.com"}/calendar/0/deeplink/compose?${q.toString()}`;
}

/** Safe file name for a download. */
export function icsFileName(title: string): string {
  return (
    (title
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "event") + ".ics"
  );
}
