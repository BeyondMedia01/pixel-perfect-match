import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { ActaLogo } from "@/components/acta-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteFirmOwner, type OwnerInviteResult } from "@/lib/platform.functions";

export const Route = createFileRoute("/platform/invite")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Invite a firm — Acta" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: PlatformInvite,
});

/** For Revixions: invite a firm's managing partner. Needs the platform key. */
function PlatformInvite() {
  const [form, setForm] = useState({ key: "", fullName: "", email: "", firmName: "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OwnerInviteResult | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setResult(await inviteFirmOwner({ data: form }));
    } catch {
      setResult({ ok: false, message: "Check the name and email, then try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <ActaLogo />
        <h1 className="page-title mt-8">Invite a firm</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Invite the managing partner. When they open the invitation they choose a password and set
          up the firm&apos;s details. They can then invite their team.
        </p>

        {result?.ok ? (
          <div className="mt-6 space-y-4">
            <div role="status" className="rounded-md border bg-card p-4 text-sm">
              {result.message}
            </div>
            {result.link && (
              <div className="space-y-1.5">
                <Label htmlFor="owner-link">Invitation link</Label>
                <div className="flex gap-2">
                  <Input id="owner-link" readOnly value={result.link} className="text-xs" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Copy invitation link"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(result.link!)
                        .then(() => toast.success("Link copied"))
                        .catch(() => toast.error("Couldn't copy. Select the link and copy it."))
                    }
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  It signs them in, so send it only to them. It works once.
                </p>
              </div>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setResult(null);
                setForm({ ...form, fullName: "", email: "", firmName: "" });
              }}
            >
              Invite another
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="owner-name">Managing partner&apos;s name</Label>
              <Input
                id="owner-name"
                required
                minLength={2}
                value={form.fullName}
                onChange={set("fullName")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="owner-email">Their email</Label>
              <Input
                id="owner-email"
                type="email"
                required
                value={form.email}
                onChange={set("email")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="owner-firm">Firm name</Label>
              <Input
                id="owner-firm"
                value={form.firmName}
                onChange={set("firmName")}
                aria-describedby="owner-firm-help"
              />
              <p id="owner-firm-help" className="text-xs text-muted-foreground">
                Optional. They can change it when they set up the firm.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="platform-key">Platform key</Label>
              <Input
                id="platform-key"
                type="password"
                required
                autoComplete="off"
                value={form.key}
                onChange={set("key")}
              />
            </div>
            {result && !result.ok && (
              <p role="alert" className="text-sm text-destructive">
                {result.message}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Sending…" : "Send invitation"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
