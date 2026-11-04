import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ActaLogo } from "@/components/acta-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isPartner } from "@/lib/auth";
import type { AppRole } from "@/lib/legal";
import { PASSWORD_MIN, onboarded } from "@/lib/onboarding";

export const Route = createFileRoute("/welcome")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Welcome — Acta" }, { name: "robots", content: "noindex" }],
  }),
  component: Welcome,
});

type StepKey = "password" | "you" | "firm" | "done";
type Firm = {
  firm_name: string;
  address: string;
  phone: string;
  email: string;
  registration_no: string;
  vat_number: string;
  vat_rate: string;
};
type Loaded = {
  user: User;
  role: AppRole | null;
  onboardedAt: string | null;
  you: { full_name: string; title: string; phone: string };
  firm: Firm;
  firmNamed: boolean;
};

const roleName: Record<string, string> = {
  partner: "partner",
  admin: "partner",
  lawyer: "lawyer",
  paralegal: "paralegal",
  staff: "paralegal",
  frontdesk: "front desk",
};

async function load(): Promise<Loaded | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const [{ data: profile }, { data: roles }, { data: firm }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", u.user.id),
    supabase.from("firm_settings").select("*").maybeSingle(),
  ]);
  const list = (roles ?? []).map((r) => r.role as AppRole);
  const role = list.includes("partner") || list.includes("admin") ? "partner" : (list[0] ?? null);
  return {
    user: u.user,
    role,
    onboardedAt: profile?.onboarded_at ?? null,
    you: {
      full_name: profile?.full_name ?? "",
      title: profile?.title ?? "",
      phone: profile?.phone ?? "",
    },
    firm: {
      firm_name: firm?.firm_name ?? "",
      address: firm?.address ?? "",
      phone: firm?.phone ?? "",
      email: firm?.email ?? "",
      registration_no: firm?.registration_no ?? "",
      vat_number: firm?.vat_number ?? "",
      vat_rate: firm?.vat_rate ? String(firm.vat_rate) : "",
    },
    firmNamed: !!firm?.firm_name?.trim(),
  };
}

/** Where invitation links land: set a password, enter your details and, for a partner, the firm's. */
function Welcome() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [state, setState] = useState<"loading" | "expired" | "pending" | "ready">("loading");
  const [data, setData] = useState<Loaded | null>(null);
  const [step, setStep] = useState<StepKey>("you");
  const [busy, setBusy] = useState(false);
  const [askPassword, setAskPassword] = useState(false);

  useEffect(() => {
    let done = false;
    const linkError = new URLSearchParams(window.location.hash.slice(1)).get("error_code");
    async function check() {
      const d = await load();
      if (done) return;
      if (!d) {
        setState(linkError ? "expired" : "loading");
        return;
      }
      if (d.onboardedAt) {
        onboarded.add(d.user.id);
        navigate({ to: "/dashboard", replace: true });
        return;
      }
      setData(d);
      // Everyone chooses their own password while onboarding. That also replaces
      // any password set by someone who signed up with their email beforehand.
      const ask = true;
      setAskPassword(ask);
      setStep(ask ? "password" : "you");
      setState(d.role ? "ready" : "pending");
    }
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) void check();
    });
    void check();
    // The client reads the sign-in token from the link as the page loads.
    const t = setTimeout(async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session && !done) setState("expired");
    }, 2500);
    return () => {
      done = true;
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, [navigate]);

  const partner = isPartner(data?.role);
  const steps = useMemo(() => {
    const list: { key: StepKey; label: string }[] = [];
    if (askPassword) list.push({ key: "password", label: "Your password" });
    list.push({ key: "you", label: "About you" });
    if (partner) list.push({ key: "firm", label: "Your firm" });
    list.push({ key: "done", label: "All set" });
    return list;
  }, [askPassword, partner]);
  const at = steps.findIndex((s) => s.key === step);

  async function finish(you: Loaded["you"], firm: Firm | null) {
    if (!data) return;
    setBusy(true);
    const { error } = await supabase.rpc("complete_onboarding", {
      _full_name: you.full_name,
      _title: you.title,
      _phone: you.phone,
      ...(firm ? { _firm: { ...firm, vat_rate: firm.vat_rate || "0" } } : {}),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    onboarded.add(data.user.id);
    qc.invalidateQueries({ queryKey: ["me"] });
    qc.invalidateQueries({ queryKey: ["firm-profile"] });
    qc.invalidateQueries({ queryKey: ["firm-brand"] });
    qc.invalidateQueries({ queryKey: ["profiles"] });
    setData({ ...data, you, firm: firm ?? data.firm, onboardedAt: new Date().toISOString() });
    setStep("done");
  }

  return (
    <div className="grid min-h-screen md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <aside className="hidden flex-col justify-between bg-brand-gradient p-10 text-mist md:flex">
        <div className="text-brand-foreground">
          <ActaLogo />
        </div>
        {state === "ready" && (
          <ol className="space-y-4" aria-label="Setup steps">
            {steps.map((s, i) => (
              <li
                key={s.key}
                aria-current={i === at ? "step" : undefined}
                className={`flex items-center gap-3 text-sm ${i === at ? "font-semibold text-brand-foreground" : ""}`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs ${
                    i < at
                      ? "border-brand-foreground bg-brand-foreground text-primary"
                      : i === at
                        ? "border-brand-foreground"
                        : "border-mist/50"
                  }`}
                >
                  {i < at ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
                </span>
                {s.label}
                {i < at && <span className="sr-only">(done)</span>}
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs">Access is restricted to authorised personnel and clients.</p>
      </aside>

      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 md:hidden">
            <ActaLogo />
          </div>
          {state === "ready" && (
            <p className="eyebrow mb-2 md:hidden">
              Step {at + 1} of {steps.length}
            </p>
          )}

          {state === "loading" && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
              Opening your invitation…
            </p>
          )}

          {state === "expired" && (
            <div className="space-y-4">
              <h1 className="page-title">This link has expired</h1>
              <p className="text-sm text-muted-foreground">
                Invitation links work once and expire after a day. Ask whoever invited you to send a
                new one. If you've already set a password, sign in instead.
              </p>
              <Button asChild variant="outline">
                <Link to="/auth">Go to sign in</Link>
              </Button>
            </div>
          )}

          {state === "pending" && (
            <div className="space-y-4">
              <h1 className="page-title">You're signed in</h1>
              <p className="text-sm text-muted-foreground">
                Your account doesn't have access to a firm yet. A partner needs to invite you before
                you can continue.
              </p>
              <Button asChild variant="outline">
                <Link to="/dashboard">Continue</Link>
              </Button>
            </div>
          )}

          {state === "ready" && data && step === "password" && (
            <PasswordStep email={data.user.email ?? ""} onDone={() => setStep("you")} />
          )}

          {state === "ready" && data && step === "you" && (
            <YouStep
              initial={data.you}
              email={data.user.email ?? ""}
              role={data.role}
              firmName={data.firmNamed ? data.firm.firm_name : null}
              busy={busy}
              last={!partner}
              onBack={undefined}
              onNext={(you) => {
                if (partner) {
                  setData({ ...data, you });
                  setStep("firm");
                } else void finish(you, null);
              }}
            />
          )}

          {state === "ready" && data && step === "firm" && (
            <FirmStep
              initial={data.firm}
              named={data.firmNamed}
              busy={busy}
              onBack={() => setStep("you")}
              onNext={(firm) => void finish(data.you, firm)}
            />
          )}

          {state === "ready" && data && step === "done" && (
            <div className="space-y-6">
              <div>
                <h1 className="page-title">
                  You're all set, {data.you.full_name.split(" ")[0] || "welcome"}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {partner
                    ? `${data.firm.firm_name} is ready. Next, invite your team so they can join you.`
                    : `Welcome to ${data.firm.firm_name || "your firm"}.`}
                </p>
              </div>
              {partner && (
                <p className="text-sm text-muted-foreground">
                  You can add your logo and bank details for invoices any time in Settings.
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                {partner && (
                  <Button onClick={() => navigate({ to: "/team" })}>Invite your team</Button>
                )}
                <Button
                  variant={partner ? "outline" : "default"}
                  onClick={() => navigate({ to: "/dashboard" })}
                >
                  Go to dashboard
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StepHeading({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-6">
      <h1 className="page-title">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function PasswordStep({ email, onDone }: { email: string; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < PASSWORD_MIN) {
      setError(`Use at least ${PASSWORD_MIN} characters.`);
      return;
    }
    if (password !== again) {
      setError("The two passwords don't match.");
      return;
    }
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({
      password,
      data: { invited: false, password_set: true },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <StepHeading
        title="Welcome to Acta"
        body="You've been invited to your firm's workspace. First, choose a password for signing in."
      />
      <div className="space-y-1.5">
        <Label htmlFor="ob-email">Email</Label>
        <Input id="ob-email" value={email} readOnly disabled autoComplete="username" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ob-pw">Password</Label>
        <Input
          id="ob-pw"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="ob-pw-help"
          aria-invalid={!!error}
          autoFocus
        />
        <p id="ob-pw-help" className="text-xs text-muted-foreground">
          At least {PASSWORD_MIN} characters.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ob-pw2">Type it again</Label>
        <Input
          id="ob-pw2"
          type="password"
          autoComplete="new-password"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
          aria-invalid={!!error}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}

function YouStep({
  initial,
  email,
  role,
  firmName,
  busy,
  last,
  onBack,
  onNext,
}: {
  initial: Loaded["you"];
  email: string;
  role: AppRole | null;
  firmName: string | null;
  busy: boolean;
  last: boolean;
  onBack: (() => void) | undefined;
  onNext: (you: Loaded["you"]) => void;
}) {
  const [you, setYou] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Loaded["you"]) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setYou({ ...you, [k]: e.target.value });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (you.full_name.trim().length < 2) {
      setError("Enter your full name.");
      return;
    }
    setError(null);
    onNext({
      full_name: you.full_name.trim(),
      title: you.title.trim(),
      phone: you.phone.trim(),
    });
  }

  const joining = firmName ? ` at ${firmName}` : "";
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <StepHeading
        title="About you"
        body={`You're joining as a ${roleName[role ?? ""] ?? "member"}${joining}. Colleagues see these details in Acta.`}
      />
      <div className="space-y-1.5">
        <Label htmlFor="ob-name">Full name</Label>
        <Input
          id="ob-name"
          autoComplete="name"
          value={you.full_name}
          onChange={set("full_name")}
          aria-invalid={!!error}
          aria-describedby={error ? "ob-name-error" : undefined}
          autoFocus
        />
        {error && (
          <p id="ob-name-error" role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ob-title">Job title</Label>
        <Input
          id="ob-title"
          autoComplete="organization-title"
          placeholder={role === "partner" ? "Managing Partner" : "e.g. Associate"}
          value={you.title}
          onChange={set("title")}
          maxLength={80}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ob-phone">Phone</Label>
        <Input
          id="ob-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+263 77 123 4567"
          value={you.phone}
          onChange={set("phone")}
          maxLength={40}
        />
      </div>
      <p className="text-xs text-muted-foreground">Signed in as {email}</p>
      <div className="flex gap-3">
        {onBack && (
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>
        )}
        <Button type="submit" className="flex-1" disabled={busy}>
          {busy ? "Saving…" : last ? "Finish" : "Continue"}
        </Button>
      </div>
    </form>
  );
}

function FirmStep({
  initial,
  named,
  busy,
  onBack,
  onNext,
}: {
  initial: Firm;
  named: boolean;
  busy: boolean;
  onBack: () => void;
  onNext: (firm: Firm) => void;
}) {
  const [firm, setFirm] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof Firm, string>>>({});
  const set = (k: keyof Firm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFirm({ ...firm, [k]: e.target.value });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!firm.firm_name.trim()) next.firm_name = "Enter your firm's name.";
    if (firm.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(firm.email.trim()))
      next.email = "Enter a valid email address, or leave it blank.";
    const rate = firm.vat_rate.trim();
    if (rate && !(Number(rate) >= 0 && Number(rate) <= 100))
      next.vat_rate = "Enter a percentage between 0 and 100.";
    setErrors(next);
    if (Object.keys(next).length) return;
    onNext(
      Object.fromEntries(Object.entries(firm).map(([k, v]) => [k, v.trim()])) as unknown as Firm,
    );
  }

  const field = (
    k: keyof Firm,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
    help?: string,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`firm-${k}`}>{label}</Label>
      <Input
        id={`firm-${k}`}
        value={firm[k]}
        onChange={set(k)}
        aria-invalid={!!errors[k]}
        aria-describedby={errors[k] || help ? `firm-${k}-note` : undefined}
        {...props}
      />
      {(errors[k] || help) && (
        <p
          id={`firm-${k}-note`}
          role={errors[k] ? "alert" : undefined}
          className={`text-xs ${errors[k] ? "text-destructive" : "text-muted-foreground"}`}
        >
          {errors[k] ?? help}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <StepHeading
        title={named ? "Check your firm's details" : "Your firm"}
        body="These appear on your invoices, the client intake form and the sign-in page. You can change them later in Settings."
      />
      {field("firm_name", "Firm name", {
        autoComplete: "organization",
        maxLength: 120,
        autoFocus: true,
      })}
      <div className="space-y-1.5">
        <Label htmlFor="firm-address">Address</Label>
        <Textarea
          id="firm-address"
          rows={3}
          autoComplete="street-address"
          placeholder={"7th Floor, Pearl House\n48 Samora Machel Avenue, Harare"}
          value={firm.address}
          onChange={set("address")}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("phone", "Phone", { type: "tel", inputMode: "tel", autoComplete: "tel" })}
        {field("email", "Accounts email", { type: "email", autoComplete: "email" })}
      </div>
      {field(
        "registration_no",
        "Registration number",
        {},
        "e.g. your Law Society registration. Optional.",
      )}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {field("vat_number", "VAT number", {}, "Leave blank if not VAT-registered.")}
        {field("vat_rate", "VAT rate (%)", { inputMode: "decimal", placeholder: "15" })}
      </div>

      <div className="rounded-md border bg-card p-4" aria-label="How your invoices will look">
        <p className="eyebrow mb-2">On your invoices</p>
        <p className="font-semibold">{firm.firm_name.trim() || "Your firm name"}</p>
        {firm.address.trim() && (
          <p className="whitespace-pre-line text-xs text-muted-foreground">{firm.address.trim()}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {[firm.phone.trim(), firm.email.trim()].filter(Boolean).join(" · ")}
        </p>
        {firm.vat_number.trim() && (
          <p className="text-xs text-muted-foreground">VAT {firm.vat_number.trim()}</p>
        )}
      </div>

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button type="submit" className="flex-1" disabled={busy}>
          {busy ? "Saving…" : "Finish"}
        </Button>
      </div>
    </form>
  );
}
