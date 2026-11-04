import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ActaLogo } from "@/components/acta-logo";
import { ConfirmProvider } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { getPlatformAccess } from "@/lib/platform.functions";

export const Route = createFileRoute("/platform")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Platform — Acta" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: PlatformLayout,
});

const NAV = [
  { to: "/platform", label: "Firms", exact: true },
  { to: "/platform/billing", label: "Billing", exact: false },
  { to: "/platform/plans", label: "Plans", exact: false },
] as const;

/** The Revixions side of Acta: every firm, their plans and what they owe. */
function PlatformLayout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const access = useQuery({
    queryKey: ["platform-access"],
    queryFn: () => getPlatformAccess(),
    staleTime: 5 * 60_000,
  });

  async function signOut() {
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (access.isPending) {
    return <p className="p-8 text-sm text-muted-foreground">Checking your access…</p>;
  }
  if (!access.data?.admin) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-4">
          <ActaLogo />
          <h1 className="page-title">Not available</h1>
          <p className="text-sm text-muted-foreground">
            The platform dashboard is for the Acta team at Revixions.
          </p>
          <Button asChild variant="outline">
            <Link to="/dashboard">Go to Acta</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <ConfirmProvider>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 border-b bg-card">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 md:px-8">
            <Link to="/platform" className="flex items-center gap-2" aria-label="Platform home">
              <ActaLogo />
              <span className="hidden rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground sm:inline">
                Platform
              </span>
            </Link>
            <nav className="flex items-center gap-1" aria-label="Platform">
              {NAV.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  activeOptions={{ exact: n.exact }}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                  activeProps={{ className: "bg-accent text-foreground", "aria-current": "page" }}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-1">
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link to="/dashboard">Open Acta</Link>
              </Button>
              <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
          <Outlet />
        </main>
      </div>
    </ConfirmProvider>
  );
}
