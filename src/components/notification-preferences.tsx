import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Bell, Mail, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useMe, isInternalRole } from "@/lib/auth";
import {
  ALERT_CATEGORIES,
  DEFAULT_CHANNEL_PREFS,
  channelPreferenceKey,
  normaliseWhatsAppNumber,
  type ChannelNotificationPrefs,
  type NotificationChannel,
} from "@/lib/notifications";
import { getNotificationChannels } from "@/lib/notification-channels.functions";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Prefs = ChannelNotificationPrefs & { whatsapp_number: string | null };
type Insert = Database["public"]["Tables"]["notification_preferences"]["Insert"];
type ChannelState = "active" | "checking" | "unknown" | "not_connected" | "setup_required";

const channels = [
  { key: "in_app", label: "In-app", Icon: Bell },
  { key: "email", label: "Email", Icon: Mail },
  { key: "whatsapp", label: "WhatsApp", Icon: MessageCircle },
] as const;

const stateLabel: Record<ChannelState, string> = {
  active: "On",
  checking: "Checking…",
  unknown: "Status unavailable",
  not_connected: "Not connected",
  setup_required: "Setup incomplete",
};

function StatusPill({ state }: { state: ChannelState }) {
  const tone =
    state === "active"
      ? "border-success/40 bg-success/10 text-success"
      : state === "checking" || state === "unknown"
        ? "border-border bg-muted text-muted-foreground"
        : "border-warning/50 bg-warning/10 text-warning";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}
    >
      {(state === "not_connected" || state === "setup_required") && (
        <AlertTriangle className="h-3 w-3" aria-hidden />
      )}
      {stateLabel[state]}
    </span>
  );
}

export function NotificationPreferences() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const getChannels = useServerFn(getNotificationChannels);
  const key = ["notification-prefs", me?.user.id];
  const internal = isInternalRole(me?.role);

  const prefs = useQuery({
    queryKey: key,
    enabled: !!me,
    queryFn: async (): Promise<Prefs> => {
      const base = { ...DEFAULT_CHANNEL_PREFS, whatsapp_number: null };
      if (!me) return base;
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", me.user.id)
        .maybeSingle();
      if (error) throw error;
      return { ...base, ...data };
    },
  });
  const status = useQuery({
    queryKey: ["notification-channels", me?.user.id],
    enabled: !!me,
    queryFn: () => getChannels(),
    refetchOnWindowFocus: true,
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<Insert>) => {
      if (!me) throw new Error("Please sign in again.");
      const { data, error } = await supabase
        .from("notification_preferences")
        .upsert({ ...patch, user_id: me.user.id, updated_at: new Date().toISOString() })
        .select("*")
        .single();
      if (error) throw error;
      return { ...DEFAULT_CHANNEL_PREFS, ...data } as Prefs;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<Prefs>(key);
      if (before) qc.setQueryData(key, { ...before, ...patch });
      return { before };
    },
    onSuccess: (data) => {
      qc.setQueryData(key, data);
      qc.invalidateQueries({ queryKey: ["staff-notifications"] });
    },
    onError: (_e, _patch, ctx) => {
      if (ctx?.before) qc.setQueryData(key, ctx.before);
      toast.error("Could not save your choice. Please try again.");
    },
  });

  function channelState(channel: NotificationChannel): ChannelState {
    if (channel === "in_app") return "active";
    if (status.isPending) return "checking";
    if (status.isError || !status.data) return "unknown";
    return status.data[channel];
  }
  const disconnected = channels
    .filter((c) => c.key !== "in_app")
    .filter((c) => ["not_connected", "setup_required"].includes(channelState(c.key)));

  const visible = ALERT_CATEGORIES.filter((c) => internal || !c.internalOnly);
  const data = prefs.data;
  const wantsWhatsApp =
    !!data && visible.some((c) => data[channelPreferenceKey("whatsapp", c.key)]);

  return (
    <section className="border-t pt-6" aria-labelledby="notification-heading">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="notification-heading" className="text-xl">
          Notifications
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Check delivery channels again"
          title="Check delivery channels again"
          onClick={() => status.refetch()}
        >
          <RefreshCw
            className={`h-4 w-4 ${status.isFetching ? "animate-spin motion-reduce:animate-none" : ""}`}
          />
        </Button>
      </div>
      <p className="mb-5 text-sm text-muted-foreground">
        Choose which alerts reach you, and where. Only you see these settings.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        {channels.map(({ key: channel, label, Icon }) => {
          const state = channelState(channel);
          return (
            <div key={channel} className="rounded-md border p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-signal" aria-hidden />
                  <h3 className="text-sm font-semibold">{label}</h3>
                </div>
                <StatusPill state={state} />
              </div>
              <p className="break-words text-xs text-muted-foreground">
                {channel === "in_app"
                  ? "Shown in the bell at the top of Acta."
                  : state === "checking"
                    ? "Checking whether this channel is connected…"
                    : state === "unknown"
                      ? "Acta couldn't check this channel. Try again in a moment."
                      : channel === "email"
                        ? state === "setup_required"
                          ? "An email service is linked, but sending alerts isn't switched on yet."
                          : "No email service is connected yet, so no alert emails are sent."
                        : state === "setup_required"
                          ? "WhatsApp Business is linked, but sending alerts isn't switched on yet."
                          : "No WhatsApp Business number is connected yet, so no messages are sent."}
              </p>
              {channel === "email" && me?.user.email && (
                <p className="mt-2 break-all text-xs">
                  <span className="text-muted-foreground">Would go to </span>
                  {me.user.email}
                </p>
              )}
              {channel === "whatsapp" && data && (
                <WhatsAppNumber
                  saved={data.whatsapp_number}
                  needed={wantsWhatsApp}
                  saving={save.isPending}
                  onSave={(whatsapp_number) =>
                    save.mutate(
                      { whatsapp_number },
                      {
                        onSuccess: () =>
                          toast.success(
                            whatsapp_number ? "WhatsApp number saved" : "WhatsApp number removed",
                          ),
                      },
                    )
                  }
                />
              )}
            </div>
          );
        })}
      </div>

      {disconnected.length > 0 && (
        <div
          role="status"
          className="mt-4 flex gap-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <p>
            {disconnected.map((c) => c.label).join(" and ")}{" "}
            {disconnected.length > 1 ? "aren't" : "isn't"} connected yet. You can choose alerts for{" "}
            {disconnected.length > 1 ? "them" : "it"} now, and they'll start once{" "}
            {disconnected.length > 1 ? "they're" : "it's"} set up for the firm. Until then you'll
            only get alerts in Acta.
          </p>
        </div>
      )}

      <div className="mt-5">
        {prefs.isPending ? (
          <p className="text-sm text-muted-foreground">Loading your preferences…</p>
        ) : prefs.isError || !data ? (
          <div role="alert" className="flex items-center gap-3">
            <p className="text-sm text-destructive">Could not load your preferences.</p>
            <Button variant="outline" size="sm" onClick={() => prefs.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="border-y">
            <div className="hidden gap-4 border-b py-2 sm:grid sm:grid-cols-[minmax(0,1fr)_repeat(3,104px)]">
              <span className="text-xs font-medium text-muted-foreground">Alert</span>
              {channels.map((c) => {
                const state = channelState(c.key);
                const off = state === "not_connected" || state === "setup_required";
                return (
                  <span key={c.key} className="text-center text-xs">
                    <span className="block font-medium">{c.label}</span>
                    <span
                      className={off ? "text-warning" : "text-muted-foreground"}
                      id={`channel-note-${c.key}`}
                    >
                      {c.key === "in_app" ? "On" : stateLabel[state]}
                    </span>
                  </span>
                );
              })}
            </div>
            <div className="divide-y">
              {visible.map((category) => (
                <div
                  key={category.key}
                  className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_repeat(3,104px)] sm:items-center sm:gap-4"
                >
                  <div>
                    <h3 className="text-sm font-medium">{category.label}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{category.detail}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 sm:contents">
                    {channels.map((channel) => {
                      const field = channelPreferenceKey(channel.key, category.key);
                      const state = channelState(channel.key);
                      const off = state === "not_connected" || state === "setup_required";
                      const id = `notify-${channel.key}-${category.key}`;
                      return (
                        <div
                          key={channel.key}
                          className={`flex flex-col items-center justify-center gap-1.5 rounded-md py-1 ${
                            off ? "bg-muted/50" : ""
                          }`}
                        >
                          <label className="text-xs text-muted-foreground sm:sr-only" htmlFor={id}>
                            {channel.label}
                          </label>
                          <Switch
                            id={id}
                            aria-label={`${category.label} by ${channel.label}`}
                            aria-describedby={off ? `channel-note-${channel.key}` : undefined}
                            checked={data[field]}
                            onCheckedChange={(checked) => save.mutate({ [field]: checked })}
                          />
                          {off && (
                            <span className="text-[10px] text-warning sm:hidden">
                              Not connected
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function WhatsAppNumber({
  saved,
  needed,
  saving,
  onSave,
}: {
  saved: string | null;
  needed: boolean;
  saving: boolean;
  onSave: (value: string | null) => void;
}) {
  const [value, setValue] = useState(saved ?? "");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setValue(saved ?? ""), [saved]);
  const dirty = value.trim() !== (saved ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) {
      setError(null);
      onSave(null);
      return;
    }
    const number = normaliseWhatsAppNumber(value);
    if (!number) {
      setError("Use international format with the country code, e.g. +263 77 123 4567.");
      return;
    }
    setError(null);
    setValue(number);
    onSave(number);
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-1.5" noValidate>
      <Label htmlFor="whatsapp-number" className="text-xs">
        Your WhatsApp number
      </Label>
      <div className="flex gap-2">
        <Input
          id="whatsapp-number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+263 77 123 4567"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={!!error}
          aria-describedby="whatsapp-number-help"
          className="h-8 text-sm"
        />
        <Button type="submit" size="sm" variant="outline" disabled={!dirty || saving}>
          Save
        </Button>
      </div>
      <p
        id="whatsapp-number-help"
        className={`text-xs ${error ? "text-destructive" : needed && !saved ? "text-warning" : "text-muted-foreground"}`}
        role={error ? "alert" : undefined}
      >
        {error ??
          (needed && !saved
            ? "Add your number so WhatsApp alerts have somewhere to go."
            : "Only you can see this number.")}
      </p>
    </form>
  );
}
