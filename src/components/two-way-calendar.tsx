import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  disconnectCalendar,
  getCalendarSyncStatus,
  startCalendarConnect,
  syncMyCalendars,
} from "@/lib/calendar-sync.functions";
import { PROVIDER_LABELS, type ProviderId } from "@/lib/calendar-sync/types";
import { useConfirm } from "@/components/confirm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const RESULT_MESSAGES: Record<string, [string, "success" | "error"]> = {
  connected: [
    "Calendar connected. Your Acta dates are on their way into a calendar called “Acta”.",
    "success",
  ],
  cancelled: ["Calendar connection cancelled.", "error"],
  expired: ["That sign-in took too long. Try connecting again.", "error"],
  failed: [
    "Couldn't connect the calendar. Try again, or ask a partner to check the setup.",
    "error",
  ],
  "not-configured": ["This calendar isn't set up for your firm yet.", "error"],
};

/** Connect Google or Outlook for two-way sync. Lives inside Settings → Calendar sync. */
export function TwoWayCalendarSync() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const { data: status, isLoading } = useQuery({
    queryKey: ["calendar-sync-status"],
    queryFn: () => getCalendarSyncStatus(),
  });

  // Coming back from Google / Microsoft.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const result = q.get("calendar");
    if (!result) return;
    const [msg, kind] = RESULT_MESSAGES[result] ?? RESULT_MESSAGES["failed"]!;
    if (kind === "success") toast.success(msg);
    else toast.error(msg);
    q.delete("calendar");
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${q.size ? `?${q}` : ""}${window.location.hash}`,
    );
    qc.invalidateQueries({ queryKey: ["calendar-sync-status"] });
  }, [qc]);

  async function connect(provider: ProviderId) {
    setBusy(provider);
    try {
      const { url } = await startCalendarConnect({ data: { provider } });
      window.location.assign(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start connecting");
      setBusy(null);
    }
  }

  async function syncNow() {
    setBusy("sync");
    try {
      const r = await syncMyCalendars({ data: { force: true } });
      const failed = r.filter((x) => !x.ok);
      if (failed.length) toast.error(failed[0]!.error ?? "Sync failed");
      else toast.success("Calendar synced");
      qc.invalidateQueries({ queryKey: ["calendar-sync-status"] });
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(provider: ProviderId) {
    const ok = await confirm({
      title: `Disconnect ${PROVIDER_LABELS[provider]}?`,
      body: "The “Acta” calendar is removed from that account and syncing stops. Events you added there stay in Acta.",
      action: "Disconnect",
      destructive: true,
    });
    if (!ok) return;
    setBusy(provider);
    try {
      await disconnectCalendar({ data: { provider } });
      toast.success("Disconnected");
      qc.invalidateQueries({ queryKey: ["calendar-sync-status"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't disconnect");
    } finally {
      setBusy(null);
    }
  }

  if (isLoading || !status) return null;
  const providers: ProviderId[] = ["google", "microsoft"];
  const anyConfigured = status.configured.length > 0;

  return (
    <div className="mt-6 border-t pt-5">
      <h3 className="text-sm font-semibold">Two-way sync</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect your Google or Microsoft account and Acta keeps a calendar called “Acta” there.
        Meetings you move or rename in it are updated in Acta, and events you add to it appear in
        Acta for you only. Court dates, hearings and filing deadlines can only be changed in Acta.
      </p>
      {!anyConfigured ? (
        <p className="mt-3 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Not set up for this firm yet. A partner or developer needs to register Acta with Google
          and Microsoft and add the keys to Lovable Cloud (see docs/calendar-sync-setup.md in the
          code). The subscription link above works in the meantime.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {providers.map((p) => {
            const c = status.connections.find((x) => x.provider === p);
            const configured = status.configured.includes(p);
            return (
              <li
                key={p}
                className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2.5 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{PROVIDER_LABELS[p]}</div>
                  <div className="text-xs text-muted-foreground">
                    {c
                      ? `${c.accountEmail ?? "Connected"} · ${c.lastSyncedAt ? `synced ${formatDistanceToNow(new Date(c.lastSyncedAt), { addSuffix: true })}` : "not synced yet"}`
                      : configured
                        ? "Not connected"
                        : "Not set up for this firm"}
                  </div>
                  {c?.lastError && (
                    <div className="mt-0.5 text-xs text-destructive">{c.lastError}</div>
                  )}
                </div>
                {c ? (
                  <>
                    {c.lastError ? (
                      <Button size="sm" onClick={() => connect(p)} disabled={!!busy}>
                        Reconnect
                      </Button>
                    ) : (
                      <Badge variant="active">Connected</Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => disconnect(p)}
                      disabled={!!busy}
                    >
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => connect(p)}
                    disabled={!configured || !!busy}
                  >
                    {busy === p ? "Opening…" : "Connect"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {status.connections.length > 0 && (
        <Button className="mt-3" size="sm" variant="outline" onClick={syncNow} disabled={!!busy}>
          {busy === "sync" ? "Syncing…" : "Sync now"}
        </Button>
      )}
    </div>
  );
}

/** Quietly sync connected calendars when someone opens the calendar (at most every two minutes). */
// eslint-disable-next-line react-refresh/only-export-components
export function useBackgroundCalendarSync(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    syncMyCalendars({ data: { force: false } })
      .then((r) => {
        if (!cancelled && r.some((x) => x.ok && !x.skipped))
          qc.invalidateQueries({ queryKey: ["calendar-events"] });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, qc]);
}
