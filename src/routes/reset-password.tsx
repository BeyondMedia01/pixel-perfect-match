import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ActaLogo } from "@/components/acta-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Choose a new password — Acta" }, { name: "robots", content: "noindex" }],
  }),
  component: ResetPassword,
});

/** Where the emailed reset link lands. The link signs the person in; here they pick a new password. */
function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<"checking" | "ok" | "expired">("checking");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady("ok");
    });
    // The client reads the token from the link as it loads; give it a moment before calling the link expired.
    const t = setTimeout(async () => {
      const { data: s } = await supabase.auth.getSession();
      setReady((r) => (r === "ok" || s.session ? "ok" : "expired"));
    }, 1500);
    return () => {
      data.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPw) {
      toast.error("The two passwords don't match");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password, data: { invited: false } });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password changed");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <ActaLogo />
        <h1 className="page-title mt-8">Choose a new password</h1>
        {ready === "checking" && (
          <p className="mt-2 text-sm text-muted-foreground">Checking your link…</p>
        )}
        {ready === "expired" && (
          <div className="mt-4 space-y-4 text-sm">
            <p className="text-muted-foreground">
              This reset link has expired or was already used. Ask for a new one from the sign-in
              page.
            </p>
            <Button asChild variant="outline">
              <Link to="/auth">Back to sign in</Link>
            </Button>
          </div>
        )}
        {ready === "ok" && (
          <form onSubmit={save} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pw">New password</Label>
              <Input
                id="pw"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw2">Type it again</Label>
              <Input
                id="pw2"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Saving…" : "Save password"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
