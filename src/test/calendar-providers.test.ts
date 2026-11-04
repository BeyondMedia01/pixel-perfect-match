import { describe, expect, it } from "vitest";
import { googleProvider, microsoftProvider } from "@/lib/calendar-sync/providers.server";
import { ProviderError } from "@/lib/calendar-sync/types";

type Call = {
  url: string;
  method: string;
  body: string | undefined;
  headers: Record<string, string>;
};

/** A fake fetch that answers from a list of [match, status, body] in order. */
function fakeFetch(routes: [RegExp, number, unknown][]) {
  const calls: Call[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body as string | undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const i = routes.findIndex(([re]) => re.test(url));
    if (i < 0) return new Response("not mocked: " + url, { status: 599 });
    const [, status, body] = routes.splice(i, 1)[0]!;
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as typeof fetch;
  return { f, calls };
}

const ev = {
  title: "Hearing · 2026-0001",
  description: "From Acta",
  location: "Court 4",
  start: "2026-11-10T07:00:00.000Z",
  end: "2026-11-10T08:00:00.000Z",
};

describe("Google Calendar client", () => {
  const env = { clientId: "cid", clientSecret: "secret" };

  it("asks only for calendars it creates, offline", () => {
    const url = new URL(
      googleProvider(env).authorizeUrl(
        "st",
        "https://acta.test/api/calendar/oauth/google/callback",
      ),
    );
    expect(url.searchParams.get("scope")).toContain("calendar.app.created");
    expect(url.searchParams.get("scope")).not.toMatch(/auth\/calendar(\s|$)/);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("st");
  });

  it("reads changes across pages, marking cancelled ones deleted", async () => {
    const { f } = fakeFetch([
      [
        /events\?.*syncToken=old/,
        200,
        {
          items: [
            {
              id: "a",
              etag: "e1",
              summary: "Call",
              start: { dateTime: "2026-11-10T09:00:00+02:00" },
              end: { dateTime: "2026-11-10T10:00:00+02:00" },
            },
          ],
          nextPageToken: "p2",
        },
      ],
      [
        /events\?.*pageToken=p2/,
        200,
        {
          items: [
            { id: "b", status: "cancelled" },
            {
              id: "c",
              summary: "Leave",
              start: { date: "2026-11-12" },
              end: { date: "2026-11-13" },
            },
          ],
          nextSyncToken: "new",
        },
      ],
    ]);
    const r = await googleProvider(env, f).listChanges("tok", "cal", "old");
    expect(r.nextState).toBe("new");
    expect(r.changes).toEqual([
      {
        id: "a",
        deleted: false,
        version: "e1",
        title: "Call",
        location: null,
        start: "2026-11-10T07:00:00.000Z",
        end: "2026-11-10T08:00:00.000Z",
        allDay: false,
        recurring: false,
      },
      { id: "b", deleted: true },
      expect.objectContaining({ id: "c", allDay: true, start: "2026-11-12T00:00:00+02:00" }),
    ]);
  });

  it("starts a full read when Google expires the sync token", async () => {
    const { f, calls } = fakeFetch([
      [/syncToken=old/, 410, { error: { message: "gone" } }],
      [/events\?/, 200, { items: [], nextSyncToken: "fresh" }],
    ]);
    const r = await googleProvider(env, f).listChanges("tok", "cal", "old");
    expect(r.nextState).toBe("fresh");
    expect(calls[1]!.url).not.toContain("syncToken");
  });

  it("creates and updates events, and treats a missing event as gone", async () => {
    const { f, calls } = fakeFetch([
      [/events$/, 200, { id: "new1", etag: "e1" }],
      [/events\/new1$/, 404, { error: { message: "Not Found" } }],
    ]);
    const g = googleProvider(env, f);
    expect(await g.createEvent("tok", "cal", ev)).toEqual({ id: "new1", version: "e1" });
    expect(JSON.parse(calls[0]!.body!)).toMatchObject({
      summary: ev.title,
      start: { dateTime: ev.start },
      location: "Court 4",
    });
    expect(await g.updateEvent("tok", "cal", "new1", ev)).toBeNull();
  });

  it("flags a revoked refresh token as needing reconnection", async () => {
    const { f } = fakeFetch([
      [
        /oauth2\.googleapis\.com\/token/,
        400,
        { error: "invalid_grant", error_description: "Token has been expired or revoked." },
      ],
    ]);
    const err = await googleProvider(env, f)
      .refresh("r")
      .catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.reconnect).toBe(true);
  });
});

describe("Microsoft Graph client", () => {
  const env = { clientId: "cid", clientSecret: "secret", tenant: "common" };

  it("follows delta pages to the delta link and converts times to UTC", async () => {
    const { f, calls } = fakeFetch([
      [
        /calendarView\/delta\?startDateTime/,
        200,
        {
          value: [
            {
              id: "a",
              changeKey: "k1",
              subject: "Call",
              start: { dateTime: "2026-11-10T07:00:00.0000000" },
              end: { dateTime: "2026-11-10T08:00:00.0000000" },
              location: { displayName: "Zoom" },
              type: "singleInstance",
            },
          ],
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/next",
        },
      ],
      [
        /\/next$/,
        200,
        {
          value: [
            { id: "b", "@removed": { reason: "deleted" } },
            {
              id: "c",
              subject: "Series",
              start: { dateTime: "2026-11-11T07:00:00" },
              type: "occurrence",
            },
          ],
          "@odata.deltaLink": "https://graph.microsoft.com/v1.0/delta-2",
        },
      ],
    ]);
    const r = await microsoftProvider(env, f).listChanges("tok", "cal", null);
    expect(r.nextState).toBe("https://graph.microsoft.com/v1.0/delta-2");
    expect(r.changes[0]).toMatchObject({
      id: "a",
      version: "k1",
      start: "2026-11-10T07:00:00.000Z",
      location: "Zoom",
      recurring: false,
    });
    expect(r.changes[1]).toEqual({ id: "b", deleted: true });
    expect(r.changes[2]).toMatchObject({ id: "c", recurring: true });
    expect(calls[0]!.headers["prefer"]).toContain('outlook.timezone="UTC"');
  });

  it("reuses an existing Acta calendar instead of making another", async () => {
    const { f, calls } = fakeFetch([
      [/\/me\/calendars\?\$filter/, 200, { value: [{ id: "existing" }] }],
    ]);
    expect(await microsoftProvider(env, f).ensureCalendar("tok", null)).toBe("existing");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("writes events in UTC without a trailing Z, as Graph expects", async () => {
    const { f, calls } = fakeFetch([
      [/\/me\/calendars\/cal\/events$/, 201, { id: "x", changeKey: "k" }],
    ]);
    await microsoftProvider(env, f).createEvent("tok", "cal", ev);
    expect(JSON.parse(calls[0]!.body!)).toMatchObject({
      subject: ev.title,
      start: { dateTime: "2026-11-10T07:00:00", timeZone: "UTC" },
    });
  });
});
