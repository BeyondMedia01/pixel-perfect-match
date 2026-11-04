import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const FIRM_ASSETS_BUCKET = "firm-assets";

export function firmLogoUrl(path: string | null | undefined) {
  return path ? supabase.storage.from(FIRM_ASSETS_BUCKET).getPublicUrl(path).data.publicUrl : null;
}

/**
 * Name and logo. With a firm's web address (slug) it works signed out, for the
 * intake form; without one it is the signed-in person's firm.
 */
export function useFirmBrand(slug?: string | null) {
  return useQuery({
    queryKey: ["firm-brand", slug ?? null],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc("public_firm_profile", slug ? { _slug: slug } : {});
      const row = data?.[0];
      return {
        name: row?.firm_name ?? null,
        logoUrl: firmLogoUrl(row?.logo_path),
        slug: row?.slug ?? null,
      };
    },
  });
}

/** The full firm profile, for invoices and Settings. Staff only; row security picks the firm. */
export function useFirmProfile() {
  return useQuery({
    queryKey: ["firm-profile"],
    queryFn: async () => (await supabase.from("firm_settings").select("*").maybeSingle()).data,
  });
}

export type MyFirm = {
  id: string;
  name: string;
  slug: string;
  status: "trial" | "active" | "past_due" | "suspended" | "cancelled";
  plan_name: string | null;
  user_limit: number | null;
  seats_used: number;
  billing_cycle: string;
  price: number | null;
  currency: string;
  trial_ends_at: string | null;
  next_billing_date: string | null;
};

/** The signed-in person's firm, its plan and whether it may use Acta. Works while suspended. */
export function useMyFirm(enabled = true) {
  return useQuery({
    queryKey: ["my-firm"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_firm");
      if (error) throw error;
      return (data?.[0] as MyFirm | undefined) ?? null;
    },
  });
}

export const FIRM_OPEN = new Set(["trial", "active", "past_due"]);

export function money(amount: number | null | undefined, currency = "USD") {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
