import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ActaLogo } from "@/components/acta-logo";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Acta — Case management for law firms" },
      { name: "description", content: "A calm, secure workspace for matters, clients, deadlines and billing." },
      { property: "og:title", content: "Acta — Case management for law firms" },
      { property: "og:description", content: "A calm, secure workspace for matters, clients, deadlines and billing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-[#022636] text-mist">
      <header className="flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-2 text-primary-foreground">
          <ActaLogo />
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>
      <main className="mx-auto flex max-w-3xl flex-1 flex-col justify-center px-8 pb-24">
        <p className="eyebrow !text-mist">Case management</p>
        <h1 className="mt-4 text-5xl leading-tight text-primary-foreground md:text-6xl">
          Every matter, deadline and hour — in order.
        </h1>
        <p className="mt-6 max-w-xl text-lg">
          A quiet, secure workspace for partners, lawyers and staff, with a portal your clients can trust.
        </p>
        <div className="mt-10">
          <Button asChild size="lg" className="bg-mist text-night hover:bg-mist/90">
            <Link to="/auth">Open your workspace</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
