import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Inbox, CheckSquare, CalendarClock, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe, isInternalRole, isFrontdesk } from "@/lib/auth";
import {
  buildStaffAlerts,
  firmToday,
  DEFAULT_NOTIFICATION_PREFS,
  type StaffAlert,
} from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function NotificationBell() {
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const staff = isInternalRole(me?.role) || isFrontdesk(me?.role);
  const today = firmToday();
  const key = ["staff-notifications", me?.user.id, me?.role, today];
  const query = useQuery({
    queryKey: key,
    enabled: !!me && staff,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!me) return [];
      const internal = isInternalRole(me.role);
      const [inq, tasks, events, dismissed, prefs] = await Promise.all([
        supabase
          .from("inquiries")
          .select("id,name,status")
          .eq("status", "new")
          .order("received_at", { ascending: false }),
        internal
          ? supabase
              .from("tasks")
              .select("id,title,assignee_id,due_date,status")
              .eq("assignee_id", me.user.id)
              .eq("due_date", today)
              .neq("status", "done")
          : Promise.resolve({ data: [], error: null }),
        internal
          ? supabase
              .from("events")
              .select("id,title,type,confirmed_by,filed_at,matter_id")
              .in("type", ["court_date", "filing_deadline"])
              .is("confirmed_by", null)
              .is("filed_at", null)
              .order("starts_at")
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("notification_dismissals")
          .select("notification_key")
          .eq("user_id", me.user.id),
        supabase
          .from("notification_preferences")
          .select("new_inquiries,tasks_due_today,unconfirmed_deadlines")
          .eq("user_id", me.user.id)
          .maybeSingle(),
      ]);
      for (const result of [inq, tasks, events, dismissed, prefs])
        if (result.error) throw result.error;
      const hidden = new Set(dismissed.data?.map((d) => d.notification_key));
      return buildStaffAlerts({
        inquiries: inq.data ?? [],
        tasks: tasks.data ?? [],
        events: events.data ?? [],
        userId: me.user.id,
        today,
        prefs: prefs.data ?? DEFAULT_NOTIFICATION_PREFS,
      }).filter((a) => !hidden.has(a.key));
    },
  });
  const dismiss = useMutation({
    mutationFn: async (alerts: StaffAlert[]) => {
      if (!me || !alerts.length) return;
      const { error } = await supabase.from("notification_dismissals").upsert(
        alerts.map((a) => ({ user_id: me.user.id, notification_key: a.key })),
        { onConflict: "user_id,notification_key", ignoreDuplicates: true },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff-notifications"] }),
    onError: () => toast.error("Could not mark notifications as read."),
  });
  if (!staff) return null;
  const alerts = query.data ?? [];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative shrink-0"
          aria-label={`Notifications${alerts.length ? `, ${alerts.length} unread` : ""}`}
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {alerts.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {alerts.length > 99 ? "99+" : alerts.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(380px,calc(100vw-24px))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-xl">Notifications</h2>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              title="Refresh notifications"
              aria-label="Refresh notifications"
              onClick={() => query.refetch()}
            >
              <RefreshCw
                className={`h-4 w-4 ${query.isFetching ? "animate-spin motion-reduce:animate-none" : ""}`}
              />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!alerts.length || dismiss.isPending}
              onClick={() => dismiss.mutate(alerts)}
            >
              Mark all read
            </Button>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {query.isPending ? (
            <p className="p-5 text-sm text-muted-foreground">Loading notifications…</p>
          ) : query.isError ? (
            <p role="alert" className="p-5 text-sm text-destructive">
              Notifications could not be loaded. Try refreshing.
            </p>
          ) : !alerts.length ? (
            <div className="py-10 text-center">
              <Bell className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">You're all caught up.</p>
            </div>
          ) : (
            alerts.map((a) => {
              const Icon =
                a.kind === "inquiry" ? Inbox : a.kind === "task" ? CheckSquare : CalendarClock;
              const destination =
                a.kind === "inquiry"
                  ? { to: "/inquiries/$id" as const, params: { id: a.id } }
                  : a.kind === "deadline" && a.matterId
                    ? { to: "/matters/$id" as const, params: { id: a.matterId } }
                    : { to: a.kind === "task" ? ("/tasks" as const) : ("/calendar" as const) };
              return (
                <div key={a.key} className="flex items-center gap-1 border-b last:border-b-0">
                  <Link
                    {...destination}
                    onClick={() => {
                      setOpen(false);
                      dismiss.mutate([a]);
                    }}
                    className="flex min-w-0 flex-1 gap-3 px-4 py-3 hover:bg-accent"
                  >
                    <Icon className="mt-1 h-4 w-4 shrink-0 text-signal" />
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">{a.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{a.detail}</p>
                    </div>
                  </Link>
                  <Button
                    className="mr-2 shrink-0"
                    variant="ghost"
                    size="icon"
                    aria-label={`Mark ${a.title} as read`}
                    title="Mark as read"
                    disabled={dismiss.isPending}
                    onClick={() => dismiss.mutate([a])}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
