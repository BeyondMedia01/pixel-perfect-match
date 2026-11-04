import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ProviderId } from "@/lib/calendar-sync/types";

const providerInput = z.object({ provider: z.enum(["google", "microsoft"]) });

async function deps() {
  const [{ supabaseAdmin }, providers, store, engine] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("@/lib/calendar-sync/providers.server"),
    import("@/lib/calendar-sync/store.server"),
    import("@/lib/calendar-sync/engine"),
  ]);
  return { db: supabaseAdmin, ...providers, ...store, ...engine };
}

/** Which providers this site is set up for, and the signed-in person's connections. */
export const getCalendarSyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { configuredProviders } = await deps();
    const { data } = await context.supabase.rpc("my_calendar_connections");
    return {
      configured: configuredProviders(),
      connections: (data ?? []).map((c) => ({
        provider: c.provider as ProviderId,
        accountEmail: c.account_email,
        lastSyncedAt: c.last_synced_at,
        lastError: c.last_error,
      })),
    };
  });

/** Start connecting Google or Microsoft: returns the provider's sign-in page to send the browser to. */
export const startCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => providerInput.parse(input))
  .handler(async ({ data, context }) => {
    const { db, getProvider, redirectUri } = await deps();
    const { data: internal } = await context.supabase.rpc("is_internal", {
      _user_id: context.userId,
    });
    if (!internal) throw new Error("Only firm staff can connect a calendar");
    const provider = getProvider(data.provider);
    if (!provider) throw new Error("This calendar isn't set up for your firm yet");
    const origin = getRequestHeader("origin") ?? "";
    if (!/^https?:\/\//.test(origin) && !process.env["CALENDAR_SYNC_BASE_URL"])
      throw new Error("Couldn't work out this site's address");

    const state = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    await db
      .from("calendar_oauth_states")
      .delete()
      .lt("created_at", new Date(Date.now() - 15 * 60_000).toISOString());
    const { error } = await db
      .from("calendar_oauth_states")
      .insert({ state, user_id: context.userId, provider: data.provider });
    if (error) throw new Error(error.message);
    return { url: provider.authorizeUrl(state, redirectUri(origin, data.provider)) };
  });

/** Sync the signed-in person's connected calendars. Skips if it ran in the last two minutes, unless forced. */
export const syncMyCalendars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ force: z.boolean().default(false) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { db, connectionsFor, getProvider, supabaseStore, syncConnection } = await deps();
    const conns = await connectionsFor(db, context.userId);
    const out: { provider: string; ok: boolean; skipped?: boolean; error?: string }[] = [];
    for (const conn of conns as (Awaited<ReturnType<typeof connectionsFor>>[number] & {
      last_synced_at?: string | null;
    })[]) {
      if (
        !data.force &&
        conn.last_synced_at &&
        Date.now() - new Date(conn.last_synced_at).getTime() < 2 * 60_000
      ) {
        out.push({ provider: conn.provider, ok: true, skipped: true });
        continue;
      }
      const provider = getProvider(conn.provider as ProviderId);
      if (!provider) {
        out.push({ provider: conn.provider, ok: false, error: "Not set up on this site" });
        continue;
      }
      const r = await syncConnection(provider, conn, supabaseStore(db));
      out.push({ provider: conn.provider, ok: r.ok, ...(r.error ? { error: r.error } : {}) });
    }
    return out;
  });

/** Disconnect: removes the "Acta" calendar from their account (best effort) and forgets the tokens. */
export const disconnectCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => providerInput.parse(input))
  .handler(async ({ data, context }) => {
    const { db, connectionsFor, getProvider } = await deps();
    const conn = (await connectionsFor(db, context.userId)).find(
      (c) => c.provider === data.provider,
    );
    if (!conn) return { ok: true };
    const provider = getProvider(data.provider);
    if (provider && conn.calendar_id) {
      try {
        let token = conn.access_token;
        if (
          conn.refresh_token &&
          (!conn.expires_at || new Date(conn.expires_at).getTime() < Date.now() + 60_000)
        ) {
          token = (await provider.refresh(conn.refresh_token)).accessToken;
        }
        await provider.deleteCalendar(token, conn.calendar_id);
      } catch {
        // Access may already be revoked; the connection is removed either way.
      }
    }
    await db.from("calendar_connections").delete().eq("id", conn.id);
    return { ok: true };
  });
