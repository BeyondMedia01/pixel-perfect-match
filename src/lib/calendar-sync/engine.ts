/**
 * Two-way calendar sync, one connection at a time.
 *
 * Rules (kept simple on purpose, because some of these dates are court dates):
 * - Acta writes every date the person should see into a calendar called "Acta"
 *   in their Google or Microsoft account, and keeps it up to date.
 * - Meetings and "other" events changed there (time, title, place) are changed
 *   in Acta. Court dates, hearings and filing deadlines can only be changed in
 *   Acta: an edit made in the calendar app is put back at the next sync.
 * - Deleting a personal meeting there deletes it in Acta. Deleting a matter's
 *   date there doesn't: it comes back at the next sync.
 * - New events the person adds to the "Acta" calendar become personal events
 *   in Acta (only they see them). Repeating series are left alone.
 * Remote changes are read before Acta writes, so a change made in the
 * calendar app is never overwritten by the same sync.
 */
import {
  ProviderError,
  type CalendarProvider,
  type OutgoingEvent,
  type RemoteChange,
  type Tokens,
} from "./types";

export type AppEvent = {
  id: string;
  type: string;
  /** As shown in calendars: includes the matter number. */
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  matter_id: string | null;
  owner_id: string | null;
  inquiry_id: string | null;
};

export type StoredEvent = {
  id: string;
  type: string;
  title: string;
  owner_id: string | null;
  matter_id: string | null;
  inquiry_id: string | null;
};

export type Link = {
  id: string;
  event_id: string | null;
  remote_id: string;
  pushed_hash: string | null;
  remote_version: string | null;
};

export type Connection = {
  id: string;
  user_id: string;
  provider: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  calendar_id: string | null;
  sync_state: string | null;
};

export interface SyncStore {
  items(userId: string): Promise<AppEvent[]>;
  links(connectionId: string): Promise<Link[]>;
  saveLink(connectionId: string, link: Omit<Link, "id"> & { id?: string }): Promise<void>;
  deleteLink(id: string): Promise<void>;
  loadEvent(eventId: string): Promise<StoredEvent | null>;
  userCanAccessMatter(matterId: string, userId: string): Promise<boolean>;
  updateEvent(
    eventId: string,
    patch: { title: string; starts_at: string; ends_at: string | null; location: string | null },
  ): Promise<void>;
  createPersonalEvent(
    userId: string,
    ev: { title: string; starts_at: string; ends_at: string | null; location: string | null },
  ): Promise<string>;
  deleteEvent(eventId: string): Promise<void>;
  saveConnection(
    id: string,
    patch: Partial<Connection> & { last_synced_at?: string; last_error?: string | null },
  ): Promise<void>;
}

export type SyncResult = {
  ok: boolean;
  error?: string;
  reconnect?: boolean;
  pushed: { created: number; updated: number; removed: number };
  pulled: { updated: number; created: number; deleted: number; undone: number; skipped: number };
};

/** Event types people may change from their calendar app. */
export const EDITABLE_TYPES = new Set(["meeting", "other"]);
const HOUR = 3600 * 1000;

export function outgoing(item: AppEvent): OutgoingEvent {
  const start = new Date(item.starts_at);
  const end =
    item.ends_at && new Date(item.ends_at) > start
      ? new Date(item.ends_at)
      : new Date(start.getTime() + HOUR);
  const note = EDITABLE_TYPES.has(item.type)
    ? "From Acta. Changes you make to this meeting here are copied to Acta."
    : "From Acta. Change this date in Acta: edits made here are undone at the next sync.";
  return {
    title: item.title,
    description: [item.description, note].filter(Boolean).join("\n\n"),
    location: item.location,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

/** Short stable fingerprint of what Acta last wrote, to skip unchanged events. */
export function fingerprint(ev: OutgoingEvent): string {
  const s = JSON.stringify([ev.title, ev.description, ev.location, ev.start, ev.end]);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16) + ":" + s.length;
}

function stripSuffix(remoteTitle: string, shown: string | undefined, stored: string) {
  const suffix = shown && shown.startsWith(stored) ? shown.slice(stored.length) : "";
  return suffix && remoteTitle.endsWith(suffix)
    ? remoteTitle.slice(0, -suffix.length)
    : remoteTitle;
}

async function freshToken(
  provider: CalendarProvider,
  conn: Connection,
  store: SyncStore,
): Promise<string> {
  const soon = Date.now() + 60_000;
  if (conn.expires_at && new Date(conn.expires_at).getTime() > soon) return conn.access_token;
  if (!conn.refresh_token) {
    if (!conn.expires_at) return conn.access_token;
    throw new ProviderError("The calendar connection has expired", 401, true);
  }
  const t: Tokens = await provider.refresh(conn.refresh_token);
  conn.access_token = t.accessToken;
  conn.refresh_token = t.refreshToken ?? conn.refresh_token;
  conn.expires_at = t.expiresAt;
  await store.saveConnection(conn.id, {
    access_token: conn.access_token,
    refresh_token: conn.refresh_token,
    expires_at: conn.expires_at,
  });
  return conn.access_token;
}

export async function syncConnection(
  provider: CalendarProvider,
  conn: Connection,
  store: SyncStore,
): Promise<SyncResult> {
  const result: SyncResult = {
    ok: true,
    pushed: { created: 0, updated: 0, removed: 0 },
    pulled: { updated: 0, created: 0, deleted: 0, undone: 0, skipped: 0 },
  };
  try {
    const token = await freshToken(provider, conn, store);
    const calendarId = await provider.ensureCalendar(token, conn.calendar_id);
    let state = conn.sync_state;
    if (calendarId !== conn.calendar_id) {
      // New (or recreated) calendar: forget old links and start a fresh read.
      for (const l of await store.links(conn.id)) await store.deleteLink(l.id);
      state = null;
      conn.calendar_id = calendarId;
      await store.saveConnection(conn.id, { calendar_id: calendarId, sync_state: null });
    }

    let links = await store.links(conn.id);
    const byRemote = new Map(links.map((l) => [l.remote_id, l]));
    const itemsBefore = new Map((await store.items(conn.user_id)).map((i) => [i.id, i]));

    // 1. Read what changed in the person's calendar.
    const { changes, nextState } = await provider.listChanges(token, calendarId, state);
    for (const ch of changes) await pullOne(ch, conn, byRemote, itemsBefore, store, result);

    // 2. Write Acta's dates out.
    links = await store.links(conn.id);
    const byEvent = new Map(links.filter((l) => l.event_id).map((l) => [l.event_id!, l]));
    const items = await store.items(conn.user_id);
    const seen = new Set<string>();
    for (const item of items) {
      seen.add(item.id);
      const ev = outgoing(item);
      const hash = fingerprint(ev);
      const link = byEvent.get(item.id);
      if (!link) {
        const made = await provider.createEvent(token, calendarId, ev);
        await store.saveLink(conn.id, {
          event_id: item.id,
          remote_id: made.id,
          pushed_hash: hash,
          remote_version: made.version,
        });
        result.pushed.created++;
      } else if (link.pushed_hash !== hash) {
        const updated = await provider.updateEvent(token, calendarId, link.remote_id, ev);
        if (updated) {
          await store.saveLink(conn.id, {
            ...link,
            pushed_hash: hash,
            remote_version: updated.version,
          });
        } else {
          // Gone from their calendar: put it back.
          await store.deleteLink(link.id);
          const made = await provider.createEvent(token, calendarId, ev);
          await store.saveLink(conn.id, {
            event_id: item.id,
            remote_id: made.id,
            pushed_hash: hash,
            remote_version: made.version,
          });
        }
        result.pushed.updated++;
      }
    }
    // Copies of events that were deleted in Acta, or that the person can no longer see.
    for (const link of links) {
      if (link.event_id && seen.has(link.event_id)) continue;
      await provider.deleteEvent(token, calendarId, link.remote_id);
      await store.deleteLink(link.id);
      result.pushed.removed++;
    }

    await store.saveConnection(conn.id, {
      sync_state: nextState,
      last_synced_at: new Date().toISOString(),
      last_error: null,
    });
    return result;
  } catch (err) {
    const reconnect = err instanceof ProviderError && err.reconnect;
    const message = reconnect
      ? "Acta lost access to this calendar. Connect it again."
      : err instanceof Error
        ? err.message
        : "Sync failed";
    await store.saveConnection(conn.id, { last_error: message });
    return { ...result, ok: false, error: message, reconnect };
  }
}

async function pullOne(
  ch: RemoteChange,
  conn: Connection,
  byRemote: Map<string, Link>,
  items: Map<string, AppEvent>,
  store: SyncStore,
  result: SyncResult,
) {
  const link = byRemote.get(ch.id);

  if (ch.deleted) {
    if (!link) return;
    const ev = link.event_id ? await store.loadEvent(link.event_id) : null;
    const personal =
      ev &&
      !ev.matter_id &&
      !ev.inquiry_id &&
      ev.owner_id === conn.user_id &&
      EDITABLE_TYPES.has(ev.type);
    if (ev && personal) {
      await store.deleteEvent(ev.id);
      result.pulled.deleted++;
    }
    // Either way the remote copy is gone; a matter's date is written back below.
    await store.deleteLink(link.id);
    byRemote.delete(ch.id);
    return;
  }

  if (!link) {
    if (ch.recurring) {
      result.pulled.skipped++;
      return;
    }
    const id = await store.createPersonalEvent(conn.user_id, {
      title: ch.title,
      starts_at: ch.start,
      ends_at: ch.end,
      location: ch.location,
    });
    await store.saveLink(conn.id, {
      event_id: id,
      remote_id: ch.id,
      pushed_hash: null,
      remote_version: ch.version,
    });
    result.pulled.created++;
    return;
  }

  // Our own write coming back: nothing to do.
  if (ch.version && ch.version === link.remote_version) return;
  if (!link.event_id) return;
  const ev = await store.loadEvent(link.event_id);
  if (!ev) return;

  const canEdit =
    EDITABLE_TYPES.has(ev.type) &&
    !ch.recurring &&
    (ev.matter_id
      ? await store.userCanAccessMatter(ev.matter_id, conn.user_id)
      : ev.owner_id === conn.user_id);
  if (canEdit) {
    await store.updateEvent(ev.id, {
      title: stripSuffix(ch.title, items.get(ev.id)?.title, ev.title),
      starts_at: ch.start,
      ends_at: ch.end,
      location: ch.location,
    });
    result.pulled.updated++;
  } else {
    result.pulled.undone++;
  }
  // Forget what we last wrote so the next step writes Acta's version back
  // (for a meeting this just tidies the title; for a court date it undoes the edit).
  await store.saveLink(conn.id, { ...link, pushed_hash: null, remote_version: ch.version });
}
