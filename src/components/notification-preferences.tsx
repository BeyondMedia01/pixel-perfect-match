import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Mail, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useMe, isInternalRole } from "@/lib/auth";
import {
  DEFAULT_CHANNEL_PREFS,
  channelPreferenceKey,
  type ChannelNotificationPrefs,
  type NotificationChannel,
  type NotificationPrefs,
} from "@/lib/notifications";
import { getNotificationChannels } from "@/lib/notification-channels.functions";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const categories: {
  key: keyof NotificationPrefs;
  label: string;
  detail: string;
  internalOnly?: boolean;
}[] = [
  { key: "new_inquiries", label: "New inquiries", detail: "New prospective client inquiries." },
  {
    key: "tasks_due_today",
    label: "My tasks due today",
    detail: "Your unfinished tasks due today.",
    internalOnly: true,
  },
  {
    key: "unconfirmed_deadlines",
    label: "Deadlines awaiting confirmation",
    detail: "Court dates and filing deadlines awaiting a lawyer.",
    internalOnly: true,
  },
];
const channels = [
  { key: "in_app", label: "In-app", Icon: Bell },
  { key: "email", label: "Email", Icon: Mail },
  { key: "whatsapp", label: "WhatsApp", Icon: MessageCircle },
] as const;

export function NotificationPreferences() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const getChannels = useServerFn(getNotificationChannels);
  const key = ["notification-prefs", me?.user.id];
  const prefs = useQuery({
    queryKey: key,
    enabled: !!me,
    queryFn: async () => {
      if (!me) return DEFAULT_CHANNEL_PREFS;
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", me.user.id)
        .maybeSingle();
      if (error) throw error;
      return { ...DEFAULT_CHANNEL_PREFS, ...data };
    },
  });
  const status = useQuery({
    queryKey: ["notification-channels", me?.user.id],
    enabled: !!me,
    queryFn: () => getChannels(),
    refetchOnWindowFocus: true,
  });
  const save = useMutation({
    mutationFn: async ({
      field,
      checked,
    }: {
      field: keyof ChannelNotificationPrefs;
      checked: boolean;
    }) => {
      if (!me) throw new Error("Please sign in again.");
      const update: Database["public"]["Tables"]["notification_preferences"]["Insert"] = {
        user_id: me.user.id,
        updated_at: new Date().toISOString(),
      };
      update[field] = checked;
      const { data, error } = await supabase
        .from("notification_preferences")
        .upsert(update)
        .select("*")
        .single();
      if (error) throw error;
      return { ...DEFAULT_CHANNEL_PREFS, ...data };
    },
    onSuccess: (data) => {
      qc.setQueryData(key, data);
      qc.invalidateQueries({ queryKey: ["staff-notifications"] });
      toast.success("Notification preference saved");
    },
    onError: () => toast.error("Could not save your choice. Please try again."),
  });
  function channelStatus(channel: NotificationChannel) {
    if (channel === "in_app") return "Active";
    if (status.isPending) return "Checking…";
    if (status.isError) return "Status unavailable";
    return status.data?.[channel] === "setup_required" ? "Setup incomplete" : "Not connected";
  }
  return (
    <section className="border-t pt-6" aria-labelledby="notification-heading">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id="notification-heading" className="text-xl">
          Notifications
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh delivery channel status"
          title="Refresh delivery channel status"
          onClick={() => status.refetch()}
        >
          <RefreshCw
            className={`h-4 w-4 ${status.isFetching ? "animate-spin motion-reduce:animate-none" : ""}`}
          />
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {channels.map(({ key: channel, label, Icon }) => (
          <div key={channel} className="border-l-2 pl-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Icon className="h-4 w-4 text-signal" />
              <h3 className="text-sm font-semibold">{label}</h3>
              <Badge variant="secondary">{channelStatus(channel)}</Badge>
            </div>
            <p className="break-words text-xs text-muted-foreground">
              {channel === "in_app"
                ? "Staff alerts in Acta."
                : status.isError
                  ? "Connection status could not be checked."
                  : status.isPending
                    ? "Checking connection status…"
                    : channel === "email"
                      ? status.data?.email === "setup_required"
                        ? "Email is linked, but staff alert delivery is not enabled."
                        : "No staff alert email sender is connected."
                      : status.data?.whatsapp === "setup_required"
                        ? "WhatsApp is linked, but staff alert delivery is not enabled."
                        : "No WhatsApp Business number is connected."}
            </p>
          </div>
        ))}
      </div>
      <p className="my-5 text-sm text-muted-foreground">
        Email and WhatsApp choices are saved, but alerts won’t be sent until the channel is
        connected and delivery is enabled.
      </p>
      {prefs.isPending ? (
        <p className="text-sm text-muted-foreground">Loading your preferences…</p>
      ) : prefs.isError ? (
        <div role="alert" className="flex items-center gap-3">
          <p className="text-sm text-destructive">Could not load your preferences.</p>
          <Button variant="outline" size="sm" onClick={() => prefs.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="divide-y border-y">
          {categories
            .filter((c) => isInternalRole(me?.role) || !c.internalOnly)
            .map((category) => (
              <div
                key={category.key}
                className="grid gap-4 py-4 sm:grid-cols-[minmax(0,1fr)_repeat(3,100px)]"
              >
                <div>
                  <h3 className="text-sm font-medium">{category.label}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{category.detail}</p>
                </div>
                <div className="grid grid-cols-3 gap-3 sm:contents">
                  {channels.map((channel) => (
                    <div
                      key={channel.key}
                      className="flex flex-col items-center justify-center gap-2"
                    >
                      <label
                        className="text-xs text-muted-foreground"
                        htmlFor={`notify-${channel.key}-${category.key}`}
                      >
                        {channel.label}
                      </label>
                      <Switch
                        id={`notify-${channel.key}-${category.key}`}
                        aria-label={`${category.label} by ${channel.label}`}
                        checked={prefs.data[channelPreferenceKey(channel.key, category.key)]}
                        disabled={save.isPending}
                        onCheckedChange={(checked) =>
                          save.mutate({
                            field: channelPreferenceKey(channel.key, category.key),
                            checked,
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
