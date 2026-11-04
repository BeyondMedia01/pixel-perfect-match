import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Pager } from "@/components/pager";
import { allRows, usePager } from "@/lib/paging";
import { useMe } from "@/lib/auth";
import { PageHeader } from "@/components/app-shell";
import { NewClientDialog } from "@/components/client-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/clients/")({
  head: () => ({
    meta: [
      { title: "Clients — Acta" },
      { name: "description", content: "Firm clients." },
      { property: "og:title", content: "Clients — Acta" },
      { property: "og:description", content: "Firm clients." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Clients,
});

function Clients() {
  const { data: me } = useMe();
  const { data } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => allRows(supabase.from("clients").select("*").order("name").order("id")),
  });
  const pager = usePager(data ?? [], 50);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Practice"
        title="Clients"
        actions={
          me && me.role !== "client" ? (
            <NewClientDialog
              trigger={
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> New client
                </Button>
              }
            />
          ) : undefined
        }
      />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>ID / Reg.</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pager.visible.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="py-3.5">
                  <Link
                    to="/clients/$id"
                    params={{ id: c.id }}
                    className="font-medium hover:underline"
                  >
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="quiet" className="capitalize">
                    {c.type}
                  </Badge>
                </TableCell>
                <TableCell className="tabular text-xs">{c.id_number}</TableCell>
                <TableCell className="text-muted-foreground">{c.email}</TableCell>
                <TableCell className="text-muted-foreground">{c.phone}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager pager={pager} noun="clients" />
    </div>
  );
}
