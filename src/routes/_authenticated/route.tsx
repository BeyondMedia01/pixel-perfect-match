import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { onboarded } from "@/lib/onboarding";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    if (onboarded.has(data.user.id)) return;
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("onboarded_at").eq("id", data.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", data.user.id).limit(1),
    ]);
    // No role yet: the app shell shows "waiting for approval" instead.
    if (roles?.length && profile && !profile.onboarded_at) throw redirect({ to: "/welcome" });
    if (profile?.onboarded_at) onboarded.add(data.user.id);
  },
  component: AppShell,
});
