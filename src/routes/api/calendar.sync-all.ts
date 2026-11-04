import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Scheduled job: sync every connected calendar. Protected by the cron secret
// (Authorization: Bearer $LOVABLE_CRON_SECRET). Schedule it every 15 minutes.
async function run(request: Request) {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied;

  const [
    { supabaseAdmin: db },
    { getProvider },
    { supabaseStore, connectionsFor },
    { syncConnection },
  ] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("@/lib/calendar-sync/providers.server"),
    import("@/lib/calendar-sync/store.server"),
    import("@/lib/calendar-sync/engine"),
  ]);
  const started = Date.now();
  const summary = { synced: 0, failed: 0, skipped: 0 };
  for (const conn of await connectionsFor(db)) {
    // Stay well inside a worker's time limit; the rest go on the next run.
    if (Date.now() - started > 25_000) {
      summary.skipped++;
      continue;
    }
    const p = getProvider(conn.provider as "google" | "microsoft");
    if (!p) {
      summary.skipped++;
      continue;
    }
    const r = await syncConnection(p, conn, supabaseStore(db));
    if (r.ok) summary.synced++;
    else summary.failed++;
  }
  return Response.json(summary);
}

export const Route = createFileRoute("/api/calendar/sync-all")({
  server: { handlers: { POST: ({ request }) => run(request), GET: ({ request }) => run(request) } },
});
