import { createFileRoute } from "@tanstack/react-router";
import { buildIcs } from "@/lib/ics";

// Private calendar subscription feed: /api/calendar/<token>.ics
// Google Calendar, Outlook and Apple Calendar poll this URL. The token is the
// only credential, so it is long and random, and the database decides what the
// feed contains (see calendar_feed() in the migrations).
export const Route = createFileRoute("/api/calendar/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = params.token.replace(/\.ics$/i, "");
        if (!/^[a-f0-9]{64}$/.test(token)) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const [{ data: rows, error }, { data: feed }] = await Promise.all([
          supabaseAdmin.rpc("calendar_feed", { _token: token }),
          supabaseAdmin
            .from("calendar_feeds")
            .select("user_id, profile:profiles(full_name)")
            .eq("token", token)
            .maybeSingle(),
        ]);
        if (error) return new Response("Calendar unavailable", { status: 500 });
        if (!feed) return new Response("Not found", { status: 404 });

        const name = (feed.profile as { full_name?: string } | null)?.full_name;
        const body = buildIcs(
          (rows ?? []).map((r) => ({
            uid: r.uid,
            title: r.title,
            description: r.description,
            location: r.location,
            start: r.starts_at,
            end: r.ends_at,
            allDayDate: r.all_day_date,
            updated: r.updated_at,
          })),
          { name: name ? `Acta — ${name}` : "Acta" },
        );
        return new Response(body, {
          headers: {
            "content-type": "text/calendar; charset=utf-8",
            "content-disposition": 'inline; filename="acta.ics"',
            "cache-control": "private, max-age=300",
          },
        });
      },
    },
  },
});
