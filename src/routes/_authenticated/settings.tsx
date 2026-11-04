import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe, isPartner, isInternalRole, isFrontdesk } from "@/lib/auth";
import { NotificationPreferences } from "@/components/notification-preferences";
import { ROLE_LABELS, type AppRole } from "@/lib/legal";
import { PageHeader } from "@/components/app-shell";
import { useConfirm } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TwoWayCalendarSync } from "@/components/two-way-calendar";
import { Textarea } from "@/components/ui/textarea";
import { useFirmProfile, firmLogoUrl, FIRM_ASSETS_BUCKET } from "@/lib/firm";
import {
  DEMO_ACCOUNTS,
  disableDemo,
  enableDemo,
  getDemoStatus,
  resetDemo,
} from "@/lib/demo.functions";
import { formatDistanceToNow } from "date-fns";

const isDemoAccount = (email?: string | null) => DEMO_ACCOUNTS.some((a) => a.email === email);

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Acta" },
      { name: "description", content: "Your profile and firm settings." },
      { property: "og:title", content: "Settings — Acta" },
      { property: "og:description", content: "Your profile and firm settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Settings,
});

function Settings() {
  const { data: me } = useMe();
  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <PageHeader title="Settings" />
      {isPartner(me?.role) && <FirmProfileSection />}
      <ProfileSection />
      {!isDemoAccount(me?.user.email) && <PasswordSection />}
      {(isInternalRole(me?.role) || isFrontdesk(me?.role)) && <NotificationPreferences />}
      {isInternalRole(me?.role) && <CalendarSyncSection />}
      {isPartner(me?.role) && <EthicalWallsSection />}
      {isPartner(me?.role) && <DemoSection />}
    </div>
  );
}

type FirmForm = {
  firm_name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  registration_no: string;
  vat_number: string;
  vat_rate: string;
  bank_details: string;
  invoice_footer: string;
};
const FIRM_FIELDS: {
  key: keyof FirmForm;
  label: string;
  long?: boolean;
  placeholder?: string;
  wide?: boolean;
}[] = [
  { key: "firm_name", label: "Firm name", placeholder: "e.g. Makoni & Partners", wide: true },
  { key: "address", label: "Address", long: true },
  {
    key: "bank_details",
    label: "Bank details for invoices",
    long: true,
    placeholder: "Bank, branch, account name and number",
  },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Accounts email" },
  { key: "website", label: "Website" },
  { key: "registration_no", label: "Law Society / registration no." },
  { key: "vat_number", label: "VAT number" },
  { key: "vat_rate", label: "VAT rate (%)", placeholder: "0" },
  {
    key: "invoice_footer",
    label: "Invoice footer",
    long: true,
    placeholder: "e.g. Payment is due within 30 days.",
    wide: true,
  },
];

function FirmProfileSection() {
  const qc = useQueryClient();
  const { data: firm } = useFirmProfile();
  const [f, setF] = useState<FirmForm | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!firm) return null;
  const value: FirmForm = f ?? {
    firm_name: firm.firm_name ?? "",
    address: firm.address ?? "",
    phone: firm.phone ?? "",
    email: firm.email ?? "",
    website: firm.website ?? "",
    registration_no: firm.registration_no ?? "",
    vat_number: firm.vat_number ?? "",
    vat_rate: String(firm.vat_rate ?? 0),
    bank_details: firm.bank_details ?? "",
    invoice_footer: firm.invoice_footer ?? "",
  };
  const set = (k: keyof FirmForm) => (v: string) => setF({ ...value, [k]: v });
  const logo = firmLogoUrl(firm.logo_path);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["firm-profile"] });
    qc.invalidateQueries({ queryKey: ["firm-brand"] });
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const rate = parseFloat(value.vat_rate || "0");
    if (!(rate >= 0 && rate <= 100)) {
      toast.error("VAT rate must be between 0 and 100");
      return;
    }
    setBusy(true);
    const blank = (v: string) => v.trim() || null;
    const { error } = await supabase
      .from("firm_settings")
      .update({
        firm_name: blank(value.firm_name),
        address: blank(value.address),
        phone: blank(value.phone),
        email: blank(value.email),
        website: blank(value.website),
        registration_no: blank(value.registration_no),
        vat_number: blank(value.vat_number),
        vat_rate: rate,
        bank_details: blank(value.bank_details),
        invoice_footer: blank(value.invoice_footer),
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Firm profile saved");
    setF(null);
    refresh();
  }

  async function uploadLogo(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type)) {
      toast.error("Use a PNG, JPG, SVG or WebP image");
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error("Keep the logo under 1 MB");
      return;
    }
    setBusy(true);
    const path = `logo-${Date.now()}.${file.name.split(".").pop()?.toLowerCase() || "png"}`;
    const up = await supabase.storage
      .from(FIRM_ASSETS_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) {
      setBusy(false);
      toast.error(up.error.message);
      return;
    }
    const old = firm!.logo_path;
    const { error } = await supabase
      .from("firm_settings")
      .update({ logo_path: path, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (!error && old) await supabase.storage.from(FIRM_ASSETS_BUCKET).remove([old]);
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (error) toast.error(error.message);
    else {
      toast.success("Logo updated");
      refresh();
    }
  }

  async function removeLogo() {
    const old = firm!.logo_path;
    const { error } = await supabase.from("firm_settings").update({ logo_path: null }).eq("id", 1);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (old) await supabase.storage.from(FIRM_ASSETS_BUCKET).remove([old]);
    refresh();
  }

  return (
    <section id="firm-profile" className="scroll-mt-20 rounded-lg border bg-card p-5">
      <h2 className="eyebrow mb-1">Firm profile</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Shown on invoices, the client intake form and the sidebar. VAT applies to invoices created
        from now on.
      </p>
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-40 items-center justify-center rounded-md border bg-white p-2">
          {logo ? (
            <img src={logo} alt="Firm logo" className="max-h-12 max-w-36 object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">No logo</span>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="hidden"
          onChange={(e) => uploadLogo(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {logo ? "Replace logo" : "Upload logo"}
        </Button>
        {logo && (
          <Button type="button" variant="ghost" size="sm" onClick={removeLogo}>
            Remove
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          PNG, JPG, SVG or WebP, under 1 MB. A wide logo on a transparent background works best.
        </p>
      </div>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        {FIRM_FIELDS.map((fld) => (
          <div key={fld.key} className={"space-y-1.5 " + (fld.wide ? "sm:col-span-2" : "")}>
            <Label htmlFor={`firm-${fld.key}`}>{fld.label}</Label>
            {fld.long ? (
              <Textarea
                id={`firm-${fld.key}`}
                rows={3}
                value={value[fld.key]}
                placeholder={fld.placeholder}
                onChange={(e) => set(fld.key)(e.target.value)}
              />
            ) : (
              <Input
                id={`firm-${fld.key}`}
                type={fld.key === "vat_rate" ? "number" : "text"}
                min={0}
                max={100}
                step="0.5"
                value={value[fld.key]}
                placeholder={fld.placeholder}
                onChange={(e) => set(fld.key)(e.target.value)}
              />
            )}
          </div>
        ))}
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" disabled={busy || !f}>
            {busy ? "Saving…" : "Save firm profile"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function PasswordSection() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Password changed");
      setPassword("");
    }
  }
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="eyebrow mb-4">Password</h2>
      <form onSubmit={save} className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs space-y-1.5">
          <Label htmlFor="new_password">New password</Label>
          <Input
            id="new_password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" variant="outline" disabled={busy}>
          {busy ? "Saving…" : "Change password"}
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">
        At least 8 characters. Signed in with Google? You can still set one to sign in with email.
      </p>
    </section>
  );
}

function DemoSection() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const { data: status } = useQuery({ queryKey: ["demo-status"], queryFn: () => getDemoStatus() });

  async function run(kind: "enable" | "reset" | "disable") {
    if (kind === "enable") {
      const ok = await confirm({
        title: "Turn on the demo workspace?",
        body: "This creates four demo sign-ins (partner, lawyer, paralegal, front desk) and adds a sign-in button for each on the sign-in page. Anyone who can reach this site can then look around as those people, including the partner, so only do this in a demo workspace with no real client data.",
        action: "Turn on demo",
        destructive: true,
      });
      if (!ok) return;
    }
    if (
      kind === "reset" &&
      !(await confirm({
        title: "Reset the demo data?",
        body: "Demo tasks, dates, inquiries, time and invoices go back to how they started, with dates around today. Anything else people added stays.",
        action: "Reset",
      }))
    )
      return;
    if (
      kind === "disable" &&
      !(await confirm({
        title: "Turn off the demo workspace?",
        body: "The sign-in buttons disappear and the demo accounts lose their access. The demo data stays in place.",
        action: "Turn off",
        destructive: true,
      }))
    )
      return;
    setBusy(kind);
    try {
      if (kind === "enable") await enableDemo();
      else if (kind === "reset") await resetDemo();
      else await disableDemo();
      toast.success(
        kind === "enable"
          ? "Demo workspace is on"
          : kind === "reset"
            ? "Demo data reset"
            : "Demo workspace is off",
      );
      qc.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="eyebrow">Demo workspace</h2>
        {status?.enabled && <Badge variant="active">On</Badge>}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        For showing Acta to prospective firms. One sign-in per role, each with matters, tasks,
        deadlines, inquiries and billing to look at, and a reset that brings everything back to this
        week.
      </p>
      {status?.enabled ? (
        <div className="space-y-4">
          <ul className="grid gap-2 sm:grid-cols-2">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.role} className="rounded-md border p-3 text-sm">
                <div className="font-medium">
                  {a.label} · {a.name}
                </div>
                <div className="text-xs text-muted-foreground">{a.blurb}</div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            The sign-in page shows a button for each.
            {status.refreshedAt
              ? ` Data last reset ${formatDistanceToNow(new Date(status.refreshedAt), { addSuffix: true })}.`
              : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!!busy} onClick={() => run("reset")}>
              {busy === "reset" ? "Resetting…" : "Reset demo data"}
            </Button>
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={!!busy}
              onClick={() => run("disable")}
            >
              {busy === "disable" ? "Turning off…" : "Turn off demo"}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" disabled={!!busy} onClick={() => run("enable")}>
          {busy === "enable" ? "Setting up…" : "Turn on demo workspace"}
        </Button>
      )}
    </section>
  );
}

function ProfileSection() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const value = name ?? me.profile?.full_name ?? "";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: value })
      .eq("id", me!.user.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: ["me"] });
    }
  }

  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="eyebrow mb-4">Your profile</h2>
      <form onSubmit={save} className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs space-y-1.5">
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" value={value} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <p className="flex h-9 items-center text-sm text-muted-foreground">{me.user.email}</p>
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </form>
    </section>
  );
}

const CALENDAR_HELP: { app: string; steps: string }[] = [
  {
    app: "Google Calendar",
    steps:
      "On a computer, open Google Calendar, click + next to \u201cOther calendars\u201d, choose \u201cFrom URL\u201d, paste the link and click Add calendar. It then appears on your phone too.",
  },
  {
    app: "Outlook",
    steps:
      "In Outlook on the web, go to Calendar, Add calendar, Subscribe from web, paste the link and click Import. Outlook for Windows and Mac picks it up from your account.",
  },
  {
    app: "Apple Calendar",
    steps:
      "On a Mac: File, New Calendar Subscription, paste the link. On iPhone: Settings, Calendar, Accounts, Add Account, Other, Add Subscribed Calendar. Or tap the Apple button below.",
  },
];

function CalendarSyncSection() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const { data: feed, isLoading } = useQuery({
    queryKey: ["calendar-feed", me?.user.id],
    enabled: !!me,
    queryFn: async () =>
      (
        await supabase
          .from("calendar_feeds")
          .select("token")
          .eq("user_id", me!.user.id)
          .maybeSingle()
      ).data,
  });
  const url = feed ? `${window.location.origin}/api/calendar/${feed.token}.ics` : "";
  const webcal = url.replace(/^https?:/, "webcal:");

  async function create() {
    setBusy(true);
    const { error } = await supabase.from("calendar_feeds").insert({ user_id: me!.user.id });
    setBusy(false);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["calendar-feed"] });
  }

  async function reset() {
    const ok = await confirm({
      title: "Make a new calendar link?",
      body: "The old link stops working straight away. Calendars subscribed to it stop updating until you subscribe again with the new link.",
      action: "Make new link",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const del = await supabase.from("calendar_feeds").delete().eq("user_id", me!.user.id);
    const ins = del.error
      ? del
      : await supabase.from("calendar_feeds").insert({ user_id: me!.user.id });
    setBusy(false);
    if (ins.error) toast.error(ins.error.message);
    else {
      toast.success("New link ready");
      qc.invalidateQueries({ queryKey: ["calendar-feed"] });
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it.");
    }
  }

  return (
    <section id="calendar-sync" className="scroll-mt-20 rounded-lg border bg-card p-5">
      <h2 className="eyebrow mb-1">Calendar sync</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        See your Acta dates in Google Calendar, Outlook or Apple Calendar: court dates, deadlines
        and events on your matters, consultations booked with you, your own events, and your open
        tasks with due dates. Ethical walls apply. The subscription link is read-only: changes are
        made in Acta and show up in your calendar at its next refresh, usually within an hour
        (Google can take up to a day). For changes in both directions, use two-way sync below.
      </p>
      {isLoading ? null : !feed ? (
        <Button onClick={create} disabled={busy}>
          {busy ? "Creating…" : "Create my calendar link"}
        </Button>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
              aria-label="Your private calendar link"
              className="min-w-0 flex-1 font-mono text-xs"
            />
            <Button variant="outline" onClick={copy}>
              Copy link
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Keep this link private: anyone who has it can see your schedule.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a
                href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Add to Google Calendar
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a
                href={`https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent("Acta")}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Add to Outlook
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={webcal}>Add to Apple Calendar</a>
            </Button>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Step-by-step instructions
            </summary>
            <dl className="mt-3 space-y-3">
              {CALENDAR_HELP.map((h) => (
                <div key={h.app}>
                  <dt className="font-medium">{h.app}</dt>
                  <dd className="text-muted-foreground">{h.steps}</dd>
                </div>
              ))}
            </dl>
          </details>
          <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
            Make a new link
          </Button>
        </div>
      )}
      <TwoWayCalendarSync />
    </section>
  );
}

function EthicalWallsSection() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [matterId, setMatterId] = useState("");
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const { data } = useQuery({
    queryKey: ["ethical-walls"],
    queryFn: async () => {
      const [walls, matters, profiles] = await Promise.all([
        supabase
          .from("matter_ethical_walls")
          .select(
            "*, matter:matters(title, matter_number), user:profiles!matter_ethical_walls_user_id_fkey(full_name)",
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("matters")
          .select("id, title, matter_number")
          .neq("status", "closed")
          .order("matter_number"),
        supabase.from("profiles").select("id, full_name, email").order("full_name"),
      ]);
      return {
        walls: walls.data ?? [],
        matters: matters.data ?? [],
        profiles: profiles.data ?? [],
      };
    },
  });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!matterId || !userId || !reason.trim()) {
      toast.error("Fill in matter, person and reason");
      return;
    }
    const { error } = await supabase
      .from("matter_ethical_walls")
      .insert({ matter_id: matterId, user_id: userId, reason });
    if (error) toast.error(error.message);
    else {
      toast.success("Ethical wall added");
      setReason("");
      setMatterId("");
      setUserId("");
      qc.invalidateQueries({ queryKey: ["ethical-walls"] });
    }
  }
  async function remove(id: string) {
    if (
      !(await confirm({
        title: "Remove this ethical wall?",
        body: "The screened person will regain access to the matter if they're otherwise assigned to it.",
        action: "Remove wall",
        destructive: true,
      }))
    )
      return;
    const { error } = await supabase.from("matter_ethical_walls").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Ethical wall removed");
      qc.invalidateQueries({ queryKey: ["ethical-walls"] });
    }
  }

  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="eyebrow mb-1">Ethical walls</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Screening someone from a matter hides it from them everywhere — they can't open it, and it
        won't appear in their lists or search.
      </p>
      <form onSubmit={add} className="mb-5 flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs space-y-1.5">
          <Label>Matter</Label>
          <Select value={matterId} onValueChange={setMatterId}>
            <SelectTrigger>
              <SelectValue placeholder="Select matter" />
            </SelectTrigger>
            <SelectContent>
              {data?.matters.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  <span className="tabular mr-1 text-xs">{m.matter_number}</span>
                  {m.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full max-w-xs space-y-1.5">
          <Label>Person screened out</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger>
              <SelectValue placeholder="Select person" />
            </SelectTrigger>
            <SelectContent>
              {data?.profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full max-w-xs space-y-1.5">
          <Label>Reason</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Previously advised the opposing party"
          />
        </div>
        <Button type="submit" variant="outline">
          Add wall
        </Button>
      </form>
      {data?.walls.length ? (
        <ul className="divide-y">
          {data.walls.map((w: any) => (
            <li key={w.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {w.user?.full_name ?? "—"}{" "}
                  <span className="text-muted-foreground">screened from</span>{" "}
                  <span className="tabular">{w.matter?.matter_number}</span> {w.matter?.title}
                </div>
                <div className="text-xs text-muted-foreground">{w.reason}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => remove(w.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No ethical walls in place.</p>
      )}
    </section>
  );
}
