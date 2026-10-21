import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/clients/")({
  head: () => ({ meta: [{ title: "Clients — Docket" }, { name: "description", content: "Firm clients." }] }),
  component: Clients,
});

function Clients() {
  const { data } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => (await supabase.from("clients").select("*").order("name")).data ?? [],
  });
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Practice" title="Clients" />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>ID / Reg.</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="py-3.5"><Link to="/clients/$id" params={{ id: c.id }} className="font-medium hover:underline">{c.name}</Link></TableCell>
                <TableCell><Badge variant="quiet" className="capitalize">{c.type}</Badge></TableCell>
                <TableCell className="tabular text-xs">{c.id_number}</TableCell>
                <TableCell className="text-muted-foreground">{c.email}</TableCell>
                <TableCell className="text-muted-foreground">{c.phone}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
