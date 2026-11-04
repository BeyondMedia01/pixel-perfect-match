/**
 * Google Calendar and Microsoft Graph calendar clients for two-way sync.
 * Server only: reads OAuth client secrets from the environment.
 *
 * Environment (set as secrets in Lovable Cloud; see docs/calendar-sync-setup.md):
 *   GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET
 *   MICROSOFT_CALENDAR_CLIENT_ID, MICROSOFT_CALENDAR_CLIENT_SECRET, MICROSOFT_CALENDAR_TENANT (optional, default "common")
 */
import {
  ProviderError,
  type CalendarProvider,
  type OutgoingEvent,
  type ProviderId,
  type RemoteChange,
  type Tokens,
} from "./types";

const CALENDAR_NAME = "Acta";
const CALENDAR_DESCRIPTION =
  "Dates from Acta. Court dates and deadlines are managed in Acta; meetings you change here are updated in Acta.";

type Fetch = typeof fetch;

function expiresAt(seconds: unknown): string | null {
  const n = Number(seconds);
  return Number.isFinite(n) && n > 0 ? new Date(Date.now() + n * 1000).toISOString() : null;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return { raw: text };
  }
}

function errorMessage(body: Record<string, unknown>, fallback: string) {
  const e = body["error"];
  if (typeof e === "string") return String(body["error_description"] ?? e);
  if (e && typeof e === "object" && "message" in e)
    return String((e as { message: unknown }).message);
  return fallback;
}

/** Form-encoded OAuth token request shared by both providers. */
async function tokenRequest(
  f: Fetch,
  url: string,
  params: Record<string, string>,
  refreshing: boolean,
): Promise<Tokens> {
  const res = await f(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const body = await readJson(res);
  if (!res.ok || typeof body["access_token"] !== "string") {
    const grantProblem =
      body["error"] === "invalid_grant" || body["error"] === "interaction_required";
    throw new ProviderError(
      errorMessage(body, `Token request failed (${res.status})`),
      res.status,
      refreshing && grantProblem,
    );
  }
  return {
    accessToken: body["access_token"] as string,
    refreshToken:
      typeof body["refresh_token"] === "string"
        ? (body["refresh_token"] as string)
        : (params["refresh_token"] ?? null),
    expiresAt: expiresAt(body["expires_in"]),
  };
}

// ---------------------------------------------------------------- Google

export function googleProvider(
  env: { clientId: string; clientSecret: string },
  f: Fetch = fetch,
): CalendarProvider {
  const api = "https://www.googleapis.com/calendar/v3";
  const call = async (token: string, path: string, init: RequestInit = {}) => {
    const res = await f(path.startsWith("http") ? path : `${api}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    return res;
  };
  const fail = async (res: Response, what: string): Promise<never> => {
    const body = await readJson(res);
    throw new ProviderError(
      `${what}: ${errorMessage(body, res.statusText)}`,
      res.status,
      res.status === 401,
    );
  };
  const toGoogle = (ev: OutgoingEvent) => ({
    summary: ev.title,
    description: ev.description ?? "",
    location: ev.location ?? "",
    start: { dateTime: ev.start },
    end: { dateTime: ev.end },
  });

  return {
    id: "google",
    authorizeUrl(state, redirectUri) {
      const q = new URLSearchParams({
        client_id: env.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        // Only calendars this app creates: Acta never sees the person's other calendars.
        scope: "openid email https://www.googleapis.com/auth/calendar.app.created",
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state,
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
    },
    exchangeCode(code, redirectUri) {
      return tokenRequest(
        f,
        "https://oauth2.googleapis.com/token",
        {
          code,
          client_id: env.clientId,
          client_secret: env.clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        },
        false,
      );
    },
    refresh(refreshToken) {
      return tokenRequest(
        f,
        "https://oauth2.googleapis.com/token",
        {
          refresh_token: refreshToken,
          client_id: env.clientId,
          client_secret: env.clientSecret,
          grant_type: "refresh_token",
        },
        true,
      );
    },
    async accountEmail(token) {
      const res = await call(token, "https://openidconnect.googleapis.com/v1/userinfo");
      if (!res.ok) return null;
      const body = await readJson(res);
      return typeof body["email"] === "string" ? (body["email"] as string) : null;
    },
    async ensureCalendar(token, existingId) {
      if (existingId) {
        const res = await call(token, `/calendars/${encodeURIComponent(existingId)}`);
        if (res.ok) return existingId;
        if (res.status !== 404 && res.status !== 410)
          await fail(res, "Couldn't open the Acta calendar");
      }
      const res = await call(token, "/calendars", {
        method: "POST",
        body: JSON.stringify({
          summary: CALENDAR_NAME,
          description: CALENDAR_DESCRIPTION,
          timeZone: "Africa/Harare",
        }),
      });
      if (!res.ok) await fail(res, "Couldn't create the Acta calendar");
      return (await readJson(res))["id"] as string;
    },
    async deleteCalendar(token, calendarId) {
      const res = await call(token, `/calendars/${encodeURIComponent(calendarId)}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 404 && res.status !== 410)
        await fail(res, "Couldn't remove the Acta calendar");
    },
    async listChanges(token, calendarId, state) {
      const changes: RemoteChange[] = [];
      let pageToken: string | undefined;
      let syncToken = state;
      for (;;) {
        const q = new URLSearchParams({
          singleEvents: "true",
          showDeleted: "true",
          maxResults: "250",
        });
        if (syncToken) q.set("syncToken", syncToken);
        if (pageToken) q.set("pageToken", pageToken);
        const res = await call(token, `/calendars/${encodeURIComponent(calendarId)}/events?${q}`);
        if (res.status === 410 && syncToken) {
          // Google expired the sync token: start again with a full list.
          syncToken = null;
          pageToken = undefined;
          changes.length = 0;
          continue;
        }
        if (!res.ok) await fail(res, "Couldn't read the Acta calendar");
        const body = await readJson(res);
        for (const it of (body["items"] as Record<string, unknown>[] | undefined) ?? []) {
          const id = String(it["id"]);
          if (it["status"] === "cancelled") {
            changes.push({ id, deleted: true });
            continue;
          }
          const start = it["start"] as { dateTime?: string; date?: string } | undefined;
          const end = it["end"] as { dateTime?: string; date?: string } | undefined;
          const allDay = !start?.dateTime;
          changes.push({
            id,
            deleted: false,
            version: typeof it["etag"] === "string" ? (it["etag"] as string) : null,
            title: String(it["summary"] ?? "(No title)"),
            location:
              typeof it["location"] === "string" && it["location"]
                ? (it["location"] as string)
                : null,
            start: allDay
              ? `${start?.date}T00:00:00+02:00`
              : new Date(start!.dateTime!).toISOString(),
            end: allDay
              ? end?.date
                ? `${end.date}T00:00:00+02:00`
                : null
              : end?.dateTime
                ? new Date(end.dateTime).toISOString()
                : null,
            allDay,
            recurring: !!it["recurringEventId"] || !!it["recurrence"],
          });
        }
        pageToken =
          typeof body["nextPageToken"] === "string" ? (body["nextPageToken"] as string) : undefined;
        if (!pageToken)
          return {
            changes,
            nextState: (body["nextSyncToken"] as string | undefined) ?? syncToken ?? null,
          };
      }
    },
    async createEvent(token, calendarId, ev) {
      const res = await call(token, `/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: "POST",
        body: JSON.stringify(toGoogle(ev)),
      });
      if (!res.ok) await fail(res, "Couldn't add an event");
      const body = await readJson(res);
      return { id: String(body["id"]), version: (body["etag"] as string | undefined) ?? null };
    },
    async updateEvent(token, calendarId, id, ev) {
      const res = await call(
        token,
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`,
        { method: "PATCH", body: JSON.stringify(toGoogle(ev)) },
      );
      if (res.status === 404 || res.status === 410) return null;
      if (!res.ok) await fail(res, "Couldn't update an event");
      const body = await readJson(res);
      if (body["status"] === "cancelled") return null;
      return { version: (body["etag"] as string | undefined) ?? null };
    },
    async deleteEvent(token, calendarId, id) {
      const res = await call(
        token,
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!res.ok && res.status !== 404 && res.status !== 410)
        await fail(res, "Couldn't delete an event");
    },
  };
}

// ---------------------------------------------------------------- Microsoft

export function microsoftProvider(
  env: { clientId: string; clientSecret: string; tenant: string },
  f: Fetch = fetch,
): CalendarProvider {
  const graph = "https://graph.microsoft.com/v1.0";
  const scope = "offline_access openid email User.Read Calendars.ReadWrite";
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(env.tenant)}/oauth2/v2.0/token`;
  const call = (token: string, path: string, init: RequestInit = {}) =>
    f(path.startsWith("http") ? path : `${graph}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        prefer: 'outlook.timezone="UTC", odata.maxpagesize=100',
        ...(init.headers ?? {}),
      },
    });
  const fail = async (res: Response, what: string): Promise<never> => {
    const body = await readJson(res);
    throw new ProviderError(
      `${what}: ${errorMessage(body, res.statusText)}`,
      res.status,
      res.status === 401,
    );
  };
  // Graph wants "2026-11-10T07:00:00" plus a time zone, not a trailing Z.
  const utc = (iso: string) => ({
    dateTime: new Date(iso).toISOString().replace(/\.\d{3}Z$/, ""),
    timeZone: "UTC",
  });
  const fromUtc = (dt?: string) =>
    dt ? new Date(/[zZ]|[+-]\d\d:\d\d$/.test(dt) ? dt : `${dt}Z`).toISOString() : null;
  const toGraph = (ev: OutgoingEvent) => ({
    subject: ev.title,
    body: { contentType: "text", content: ev.description ?? "" },
    location: { displayName: ev.location ?? "" },
    start: utc(ev.start),
    end: utc(ev.end),
  });
  const windowStart = () => new Date(Date.now() - 60 * 864e5).toISOString();
  const windowEnd = () => new Date(Date.now() + 400 * 864e5).toISOString();

  return {
    id: "microsoft",
    authorizeUrl(state, redirectUri) {
      const q = new URLSearchParams({
        client_id: env.clientId,
        response_type: "code",
        redirect_uri: redirectUri,
        response_mode: "query",
        scope,
        state,
        prompt: "select_account",
      });
      return `https://login.microsoftonline.com/${encodeURIComponent(env.tenant)}/oauth2/v2.0/authorize?${q}`;
    },
    exchangeCode(code, redirectUri) {
      return tokenRequest(
        f,
        tokenUrl,
        {
          client_id: env.clientId,
          client_secret: env.clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          scope,
        },
        false,
      );
    },
    refresh(refreshToken) {
      return tokenRequest(
        f,
        tokenUrl,
        {
          client_id: env.clientId,
          client_secret: env.clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
          scope,
        },
        true,
      );
    },
    async accountEmail(token) {
      const res = await call(token, "/me?$select=mail,userPrincipalName");
      if (!res.ok) return null;
      const body = await readJson(res);
      return (
        (body["mail"] as string | null) ?? (body["userPrincipalName"] as string | null) ?? null
      );
    },
    async ensureCalendar(token, existingId) {
      if (existingId) {
        const res = await call(token, `/me/calendars/${encodeURIComponent(existingId)}`);
        if (res.ok) return existingId;
        if (res.status !== 404) await fail(res, "Couldn't open the Acta calendar");
      }
      const found = await call(
        token,
        `/me/calendars?$filter=${encodeURIComponent(`name eq '${CALENDAR_NAME}'`)}`,
      );
      if (found.ok) {
        const list = ((await readJson(found))["value"] as { id: string }[] | undefined) ?? [];
        if (list[0]) return list[0].id;
      }
      const res = await call(token, "/me/calendars", {
        method: "POST",
        body: JSON.stringify({ name: CALENDAR_NAME }),
      });
      if (!res.ok) await fail(res, "Couldn't create the Acta calendar");
      return (await readJson(res))["id"] as string;
    },
    async deleteCalendar(token, calendarId) {
      const res = await call(token, `/me/calendars/${encodeURIComponent(calendarId)}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 404) await fail(res, "Couldn't remove the Acta calendar");
    },
    async listChanges(token, calendarId, state) {
      const changes: RemoteChange[] = [];
      const first = () =>
        `/me/calendars/${encodeURIComponent(calendarId)}/calendarView/delta?startDateTime=${encodeURIComponent(windowStart())}&endDateTime=${encodeURIComponent(windowEnd())}`;
      let url = state ?? first();
      let restarted = false;
      for (;;) {
        const res = await call(token, url);
        if ((res.status === 410 || res.status === 400) && state && !restarted) {
          // The saved delta link is no longer valid: start again with a full list.
          restarted = true;
          changes.length = 0;
          url = first();
          continue;
        }
        if (!res.ok) await fail(res, "Couldn't read the Acta calendar");
        const body = await readJson(res);
        for (const it of (body["value"] as Record<string, unknown>[] | undefined) ?? []) {
          const id = String(it["id"]);
          if (it["@removed"] || it["isCancelled"] === true) {
            changes.push({ id, deleted: true });
            continue;
          }
          const start = it["start"] as { dateTime?: string } | undefined;
          const end = it["end"] as { dateTime?: string } | undefined;
          const loc = it["location"] as { displayName?: string } | undefined;
          changes.push({
            id,
            deleted: false,
            version: typeof it["changeKey"] === "string" ? (it["changeKey"] as string) : null,
            title: String(it["subject"] ?? "(No title)"),
            location: loc?.displayName ? loc.displayName : null,
            start: fromUtc(start?.dateTime) ?? new Date().toISOString(),
            end: fromUtc(end?.dateTime),
            allDay: it["isAllDay"] === true,
            recurring:
              it["type"] === "occurrence" ||
              it["type"] === "seriesMaster" ||
              it["type"] === "exception",
          });
        }
        if (typeof body["@odata.nextLink"] === "string") {
          url = body["@odata.nextLink"] as string;
          continue;
        }
        return {
          changes,
          nextState: (body["@odata.deltaLink"] as string | undefined) ?? state ?? null,
        };
      }
    },
    async createEvent(token, calendarId, ev) {
      const res = await call(token, `/me/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: "POST",
        body: JSON.stringify(toGraph(ev)),
      });
      if (!res.ok) await fail(res, "Couldn't add an event");
      const body = await readJson(res);
      return { id: String(body["id"]), version: (body["changeKey"] as string | undefined) ?? null };
    },
    async updateEvent(token, _calendarId, id, ev) {
      const res = await call(token, `/me/events/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(toGraph(ev)),
      });
      if (res.status === 404) return null;
      if (!res.ok) await fail(res, "Couldn't update an event");
      const body = await readJson(res);
      return { version: (body["changeKey"] as string | undefined) ?? null };
    },
    async deleteEvent(token, _calendarId, id) {
      const res = await call(token, `/me/events/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) await fail(res, "Couldn't delete an event");
    },
  };
}

// ---------------------------------------------------------------- config

export function configuredProviders(): ProviderId[] {
  const out: ProviderId[] = [];
  if (process.env["GOOGLE_CALENDAR_CLIENT_ID"] && process.env["GOOGLE_CALENDAR_CLIENT_SECRET"])
    out.push("google");
  if (
    process.env["MICROSOFT_CALENDAR_CLIENT_ID"] &&
    process.env["MICROSOFT_CALENDAR_CLIENT_SECRET"]
  )
    out.push("microsoft");
  return out;
}

export function getProvider(id: ProviderId): CalendarProvider | null {
  if (id === "google") {
    const clientId = process.env["GOOGLE_CALENDAR_CLIENT_ID"];
    const clientSecret = process.env["GOOGLE_CALENDAR_CLIENT_SECRET"];
    return clientId && clientSecret ? googleProvider({ clientId, clientSecret }) : null;
  }
  const clientId = process.env["MICROSOFT_CALENDAR_CLIENT_ID"];
  const clientSecret = process.env["MICROSOFT_CALENDAR_CLIENT_SECRET"];
  return clientId && clientSecret
    ? microsoftProvider({
        clientId,
        clientSecret,
        tenant: process.env["MICROSOFT_CALENDAR_TENANT"] || "common",
      })
    : null;
}

/** Where the provider sends people back to. Must match the redirect URI registered with Google / Microsoft. */
export function redirectUri(origin: string, id: ProviderId) {
  const base = (process.env["CALENDAR_SYNC_BASE_URL"] || origin).replace(/\/+$/, "");
  return `${base}/api/calendar/oauth/${id}/callback`;
}
