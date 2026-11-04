/** The database side of two-way sync, using the service role. Server only. */
import type { AppEvent, Connection, Link, StoredEvent, SyncStore } from "./engine";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function supabaseStore(db: Admin): SyncStore {
  return {
    async items(userId) {
      const rows = must(await db.rpc("calendar_events_for_user", { _user_id: userId }));
      return (rows ?? []) as AppEvent[];
    },
    async links(connectionId) {
      const rows = must(
        await db
          .from("calendar_event_links")
          .select("id, event_id, remote_id, pushed_hash, remote_version")
          .eq("connection_id", connectionId),
      );
      return (rows ?? []) as Link[];
    },
    async saveLink(connectionId, link) {
      const values = {
        connection_id: connectionId,
        event_id: link.event_id,
        remote_id: link.remote_id,
        pushed_hash: link.pushed_hash,
        remote_version: link.remote_version,
        updated_at: new Date().toISOString(),
      };
      if (link.id) must(await db.from("calendar_event_links").update(values).eq("id", link.id));
      else
        must(
          await db
            .from("calendar_event_links")
            .upsert(values, { onConflict: "connection_id,remote_id" }),
        );
    },
    async deleteLink(id) {
      must(await db.from("calendar_event_links").delete().eq("id", id));
    },
    async loadEvent(eventId) {
      const row = must(
        await db
          .from("events")
          .select("id, type, title, owner_id, matter_id, inquiry_id")
          .eq("id", eventId)
          .maybeSingle(),
      );
      return (row as StoredEvent | null) ?? null;
    },
    async userCanAccessMatter(matterId, userId) {
      return !!must(
        await db.rpc("user_can_access_matter", { _matter_id: matterId, _user_id: userId }),
      );
    },
    async updateEvent(eventId, patch) {
      must(await db.from("events").update(patch).eq("id", eventId));
    },
    async createPersonalEvent(userId, ev) {
      const row = must(
        await db
          .from("events")
          .insert({ ...ev, type: "meeting", owner_id: userId, entered_by: userId, matter_id: null })
          .select("id")
          .single(),
      );
      return (row as { id: string }).id;
    },
    async deleteEvent(eventId) {
      must(await db.from("events").delete().eq("id", eventId));
    },
    async saveConnection(id, patch) {
      must(await db.from("calendar_connections").update(patch).eq("id", id));
    },
  };
}

export async function connectionsFor(db: Admin, userId?: string): Promise<Connection[]> {
  let q = db
    .from("calendar_connections")
    .select(
      "id, user_id, provider, access_token, refresh_token, expires_at, calendar_id, sync_state, last_synced_at",
    );
  if (userId) q = q.eq("user_id", userId);
  return (must(await q) ?? []) as Connection[];
}
