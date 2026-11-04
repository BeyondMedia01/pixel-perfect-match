import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ActaLogo } from "@/components/acta-logo";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getDemoStatus, demoSignIn } from "@/lib/demo.functions";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Acta" },
      { name: "description", content: "Sign in to your Acta workspace." },
      { property: "og:title", content: "Sign in — Acta" },
      { property: "og:description", content: "Sign in to your Acta workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [demoBusy, setDemoBusy] = useState<string | null>(null);
  const { data: demo } = useQuery({ queryKey: ["demo-status"], queryFn: () => getDemoStatus(), staleTime: 60_000 });

  // Invitation links open straight on sign-up with the email filled in.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("mode") === "signup") setMode("signup");
    const invited = q.get("email");
    if (invited) setEmail(invited);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate({ to: "/dashboard", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error(error.message);
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
      });
      if (error) toast.error(error.message);
      else setSent(true);
    }
    setBusy(false);
  }

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (error) toast.error(error.message);
    else setResetSent(true);
  }

  async function tryDemo(role: "partner" | "lawyer" | "paralegal" | "frontdesk") {
    setDemoBusy(role);
    try {
      const r = await demoSignIn({ data: { role } });
      if (!r.ok) { toast.error(r.message); return; }
      const { error } = await supabase.auth.setSession({ access_token: r.access_token, refresh_token: r.refresh_token });
      if (error) toast.error(error.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't open the demo");
    } finally {
      setDemoBusy(null);
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error(r.error.message ?? "Google sign-in failed");
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-brand-gradient p-10 text-mist md:flex">
        <div className="flex items-center gap-2 text-brand-foreground">
          <ActaLogo />
        </div>
        <blockquote className="font-semibold tracking-tight text-2xl leading-snug text-brand-foreground">
          Every matter, on record.
        </blockquote>
        <p className="text-xs">Access is restricted to authorised personnel and clients.</p>
      </aside>
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="page-title">{forgot ? "Reset your password" : mode === "signin" ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {forgot
              ? "We'll email you a link to choose a new password."
              : mode === "signin" ? "Sign in to your firm workspace." : "A partner at your firm approves new accounts before they can see any firm data."}
          </p>
          {forgot ? (
            resetSent ? (
              <div className="mt-8 space-y-4 text-sm">
                <div className="rounded-md border bg-card p-4">If <strong>{email}</strong> has an account, a reset link is on its way. It works once and expires after an hour.</div>
                <Button variant="ghost" onClick={() => { setForgot(false); setResetSent(false); }}>Back to sign in</Button>
              </div>
            ) : (
              <form onSubmit={sendReset} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input id="reset-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => setForgot(false)}>Back to sign in</Button>
              </form>
            )
          ) : sent ? (
            <div className="mt-8 rounded-md border bg-card p-4 text-sm">
              Check <strong>{email}</strong> for a confirmation link, then come back to sign in. You'll have access once a partner approves your account.
            </div>
          ) : (
            <>
              {/* A two-button switch rather than tabs: there is one form, so there are no tab panels to point at. */}
              <div role="group" aria-label="Sign in or create an account" className="mt-6 grid w-full grid-cols-2 rounded-md bg-muted p-1">
                {(["signin", "signup"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => setMode(m)}
                    className={`rounded-sm px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${mode === m ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {m === "signin" ? "Sign in" : "Sign up"}
                  </button>
                ))}
              </div>
              <form onSubmit={submit} className="mt-6 space-y-4">
                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Full name</Label>
                    <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {mode === "signin" && (
                      <button type="button" onClick={() => setForgot(true)} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input id="password" type="password" required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {mode === "signin" ? "Sign in" : "Create account"}
                </Button>
              </form>
              <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
              </div>
              <Button variant="outline" className="w-full" onClick={google}>
                Continue with Google
              </Button>
              {demo?.enabled && mode === "signin" && (
                <section aria-labelledby="demo-heading" className="mt-8 rounded-lg border bg-card p-4">
                  <h2 id="demo-heading" className="text-sm font-semibold">Explore the demo</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Sign in as someone at Makoni &amp; Partners. Sample data only.</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {demo.accounts.map((a) => (
                      <Button
                        key={a.role}
                        variant="outline"
                        className="h-auto flex-col items-start gap-0.5 px-3 py-2 text-left"
                        disabled={!!demoBusy}
                        title={a.blurb}
                        onClick={() => tryDemo(a.role)}
                      >
                        <span className="text-sm font-medium">{demoBusy === a.role ? "Opening…" : a.label}</span>
                        <span className="text-[11px] font-normal text-muted-foreground">{a.name}</span>
                      </Button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
