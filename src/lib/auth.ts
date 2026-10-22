import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "./legal";

/** Partner (or legacy admin) — full access, firm settings, conflict sign-off. */
export const isPartner = (r?: AppRole | null) => r === "partner" || r === "admin";
/** Partner or lawyer — can edit matters and confirm deadlines. */
export const isLawyerish = (r?: AppRole | null) => isPartner(r) || r === "lawyer";
export const isFrontdesk = (r?: AppRole | null) => r === "frontdesk";
/** Everyone except front desk and clients. */
export const isInternalRole = (r?: AppRole | null) => isLawyerish(r) || r === "paralegal" || r === "staff";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
      ]);
      const roleList = (roles ?? []).map((r) => r.role as AppRole);
      const role: AppRole = roleList.includes("partner") || roleList.includes("admin")
        ? "partner"
        : roleList.includes("lawyer")
          ? "lawyer"
          : roleList.includes("paralegal") || roleList.includes("staff")
            ? "paralegal"
            : roleList.includes("frontdesk")
              ? "frontdesk"
              : "client";
      return { user: u.user, profile, role };
    },
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email").order("full_name");
      if (error) throw error;
      return data;
    },
  });
}
