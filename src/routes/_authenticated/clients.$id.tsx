import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { statusMeta } from "@/lib/legal";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  head: () => ({ meta: [{ title: "Client — Docket" }, { name: "description", content: "Client details and matters." }] }),
  component: ClientPage,
});

function ClientPage() {
  const { id } = Route.useParams();
  const { data } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const [c, m] = await Promise.all([
        supabase.from("clients").select("*").eq("id", id).maybeSingle(),
        supabase.from("matters").select("id, title, matter_number, status").eq("client_id", id),
      ]);
      return { client: c.data, matters: m.data ?? [] };
    },
  });
  const c = data?.client;
  if (!c) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow={c.type} title={c.name} />
      <div className="grid gap-6 lg:grid-cols-3">
        <dl className="space-y-3 rounded-lg border bg-card p-5 text-sm">
          {[["ID / Reg.", c.id_number], ["Email", c.email], ["Phone", c.phone], ["Address", c.address], ["Notes", c.notes]].map(([k, v]) => (
            <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v || "—"}</dd></div>
          ))}
        </dl>
        <div className="rounded-lg border bg-card p-5 lg:col-span-2">
          <h2 className="eyebrow mb-3">Matters</h2>
          <ul className="divide-y">
            {data.matters.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-3 text-sm">
                <span className="tabular text-xs text-muted-foreground">{m.matter_number}</span>
                <Link to="/matters/$id" params={{ id: m.id }} className="flex-1 hover:underline">{m.title}</Link>
                <Badge variant={statusMeta(m.status).variant}>{statusMeta(m.status).label}</Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
