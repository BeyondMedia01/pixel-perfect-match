import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function ConflictCheck({ names }: { names: string[] }) {
  const terms = names.map((n) => n.trim()).filter((n) => n.length >= 3);
  const { data, isFetching } = useQuery({
    queryKey: ["conflict", terms],
    enabled: terms.length > 0,
    queryFn: async () => {
      const results = await Promise.all(terms.map((t) => supabase.rpc("conflict_check", { q: t })));
      return results.flatMap((r) => r.data ?? []);
    },
  });
  if (!terms.length) return null;
  if (isFetching) return <p className="text-xs text-muted-foreground">Running conflict check…</p>;
  if (!data?.length)
    return (
      <p className="flex items-center gap-1.5 text-xs text-success">
        <CheckCircle2 className="h-3.5 w-3.5" /> No conflicts found.
      </p>
    );
  return (
    <div className="rounded-md border border-signal/40 bg-signal/10 p-3 text-xs">
      <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-signal-foreground dark:text-signal">
        <AlertTriangle className="h-3.5 w-3.5" /> Possible conflicts ({data.length})
      </p>
      <ul className="space-y-1">
        {data.slice(0, 8).map((r, i) => (
          <li key={i}>
            <strong>{r.name}</strong> — {r.source.replace("_", " ")}
            {r.matter_number && (
              <>
                {" "}
                on <span className="tabular">{r.matter_number}</span> ({r.detail})
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
