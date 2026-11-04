import { createFileRoute } from "@tanstack/react-router";

// Google / Microsoft send people back here after they allow calendar access.
// Registered redirect URI: <site>/api/calendar/oauth/google/callback (or /microsoft/callback).
export const Route = createFileRoute("/api/calendar/oauth/$provider/callback")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const back = (result: string) =>
          Response.redirect(
            `${(process.env["CALENDAR_SYNC_BASE_URL"] || url.origin).replace(/\/+$/, "")}/settings?calendar=${result}#calendar-sync`,
            302,
          );

        const provider = params.provider;
        if (provider !== "google" && provider !== "microsoft")
          return new Response("Not found", { status: 404 });
        if (url.searchParams.get("error")) return back("cancelled");
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state || !/^[a-f0-9]{48}$/.test(state)) return back("failed");

        const [
          { supabaseAdmin: db },
          { getProvider, redirectUri },
          { supabaseStore },
          { syncConnection },
        ] = await Promise.all([
          import("@/integrations/supabase/client.server"),
          import("@/lib/calendar-sync/providers.server"),
          import("@/lib/calendar-sync/store.server"),
          import("@/lib/calendar-sync/engine"),
        ]);

        // The state is single use and expires after 15 minutes.
        const { data: st } = await db
          .from("calendar_oauth_states")
          .delete()
          .eq("state", state)
          .select("user_id, provider, created_at")
          .maybeSingle();
        if (
          !st ||
          st.provider !== provider ||
          Date.now() - new Date(st.created_at).getTime() > 15 * 60_000
        )
          return back("expired");

        const p = getProvider(provider);
        if (!p) return back("not-configured");
        try {
          const tokens = await p.exchangeCode(code, redirectUri(url.origin, provider));
          const email = await p.accountEmail(tokens.accessToken);
          // Reconnecting reuses the existing "Acta" calendar instead of making a second one.
          const { data: prev } = await db
            .from("calendar_connections")
            .select("calendar_id, sync_state")
            .eq("user_id", st.user_id)
            .eq("provider", provider)
            .maybeSingle();
          const calendarId = await p.ensureCalendar(tokens.accessToken, prev?.calendar_id ?? null);
          const sameCalendar = !!prev && prev.calendar_id === calendarId;
          const { data: conn, error } = await db
            .from("calendar_connections")
            .upsert(
              {
                user_id: st.user_id,
                provider,
                account_email: email,
                access_token: tokens.accessToken,
                refresh_token: tokens.refreshToken,
                expires_at: tokens.expiresAt,
                calendar_id: calendarId,
                sync_state: sameCalendar ? prev.sync_state : null,
                last_error: null,
              },
              { onConflict: "user_id,provider" },
            )
            .select(
              "id, user_id, provider, access_token, refresh_token, expires_at, calendar_id, sync_state",
            )
            .single();
          if (error || !conn) return back("failed");
          if (!sameCalendar)
            await db.from("calendar_event_links").delete().eq("connection_id", conn.id);
          await syncConnection(p, conn, supabaseStore(db));
          return back("connected");
        } catch {
          return back("failed");
        }
      },
    },
  },
});
