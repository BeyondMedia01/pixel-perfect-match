import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ConflictHit = {
  term: string; // which of the prospect's names matched
  source: string;
  name: string;
  detail: string | null;
  matter_number: string | null;
};

/**
 * Runs the conflict check for the prospect's names against the firm's records.
 * Staff/lawyers/partners get full detail; front desk only gets counts via the
 * count-only RPC (handled by ConflictCount for that role).
 */
export function useConflictHits(terms: string[], enabled = true) {
  const clean = terms.map((t) => t.trim()).filter((t) => t.length >= 3);
  return useQuery({
    queryKey: ["conflict", clean],
    enabled: enabled && clean.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        clean.map(async (term) => {
          const { data } = await supabase.rpc("conflict_check", { q: term });
          return (data ?? []).map((r) => ({ term, ...r })) as ConflictHit[];
        }),
      );
      const seen = new Set<string>();
      return results.flat().filter((h) => {
        const key = `${h.name}|${h.source}|${h.matter_number ?? ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
  });
}

/** Count-only check for front desk (no names revealed). */
export function useConflictCount(terms: string[], enabled = true) {
  const clean = terms.map((t) => t.trim()).filter((t) => t.length >= 3);
  return useQuery({
    queryKey: ["conflict-count", clean],
    enabled: enabled && clean.length > 0,
    queryFn: async () => {
      const counts = await Promise.all(
        clean.map(async (term) => (await supabase.rpc("conflict_check_count", { q: term })).data ?? 0),
      );
      return counts.reduce((a, b) => a + b, 0);
    },
  });
}

/**
 * Demo rule: a match is "adverse" when the opposing side already appears as a
 * client of the firm, or the prospect appears as the opposing party on an
 * existing matter. Adverse matches need partner sign-off before acceptance.
 */
export function isAdverse(hit: ConflictHit, prospectName: string, opposingNames: string[]): boolean {
  const asOpposing = opposingNames.some((o) => o.trim().toLowerCase() === hit.term.toLowerCase());
  const asProspect = prospectName.trim().toLowerCase() === hit.term.toLowerCase();
  if (asOpposing && hit.source === "client") return true;
  if (asProspect && (hit.source === "opposing_party" || hit.source === "related_party")) return true;
  return false;
}

export async function logInquiryActivity(inquiryId: string, action: string, summary: string, userId?: string) {
  await supabase.from("activity_log").insert({
    entity_type: "inquiry",
    entity_id: inquiryId,
    action,
    summary,
    user_id: userId ?? null,
  });
}
