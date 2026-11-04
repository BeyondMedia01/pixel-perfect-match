import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const FIRM_ASSETS_BUCKET = "firm-assets";

export function firmLogoUrl(path: string | null | undefined) {
  return path ? supabase.storage.from(FIRM_ASSETS_BUCKET).getPublicUrl(path).data.publicUrl : null;
}

/** Name and logo only. Works signed out (intake form, sign-in page). */
export function useFirmBrand() {
  return useQuery({
    queryKey: ["firm-brand"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc("public_firm_profile");
      const row = data?.[0];
      return { name: row?.firm_name ?? null, logoUrl: firmLogoUrl(row?.logo_path) };
    },
  });
}

/** The full firm profile, for invoices and Settings. Staff only. */
export function useFirmProfile() {
  return useQuery({
    queryKey: ["firm-profile"],
    queryFn: async () =>
      (await supabase.from("firm_settings").select("*").eq("id", 1).maybeSingle()).data,
  });
}
