import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowUpDown, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MATTER_STATUSES, PRACTICE_AREAS, areaLabel, statusMeta } from "@/lib/legal";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { NewMatterDialog } from "@/components/matter-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/matters/")({
  head: () => ({ meta: [{ title: "Matters — Docket" }, { name: "description", content: "All matters you have access to." }, { property: "og:title", content: "Matters — Docket" }, { property: "og:description", content: "All matters you have access to." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Matters,
});

type SortKey = "matter_number" | "title" | "date_opened";

function Matters() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [area, setArea] = useState("all");
  const [sort, setSort] = useState<{ k: SortKey; asc: boolean }>({ k: "matter_number", asc: false });
  const { data, isLoading } = useQuery({
    queryKey: ["matters"],
    queryFn: async () => {
      const { data, error } = await supabase.from("matters").select("*, clients(id, name), lawyer:profiles!matters_responsible_lawyer_id_fkey(full_name)");
      if (error) throw error;
      return data;
    },
  });
  const rows = useMemo(() => {
    let r = data ?? [];
    if (status !== "all") r = r.filter((m) => m.status === status);
    if (area !== "all") r = r.filter((m) => m.practice_area === area);
    if (q) { const s = q.toLowerCase(); r = r.filter((m) => [m.title, m.matter_number, m.clients?.name, m.opposing_party].some((v) => v?.toLowerCase().includes(s))); }
    return [...r].sort((a, b) => { const x = String(a[sort.k] ?? ""), y = String(b[sort.k] ?? ""); return sort.asc ? x.localeCompare(y) : y.localeCompare(x); });
  }, [data, q, status, area, sort]);
  const toggle = (k: SortKey) => setSort((s) => ({ k, asc: s.k === k ? !s.asc : true }));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader eyebrow="Practice" title="Matters" actions={<NewMatterDialog trigger={<Button><Plus className="mr-1 h-4 w-4" />New matter</Button>} />} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Filter by title, number, client…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All statuses</SelectItem>{MATTER_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All practice areas</SelectItem>{PRACTICE_AREAS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {!isLoading && rows.length === 0 ? (
        <EmptyState title="No matters here" body="Open a new matter, or clear your filters. You only see matters you're responsible for or assigned to." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><SortBtn onClick={() => toggle("matter_number")}>Number</SortBtn></TableHead>
                <TableHead><SortBtn onClick={() => toggle("title")}>Matter</SortBtn></TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Lawyer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead><SortBtn onClick={() => toggle("date_opened")}>Opened</SortBtn></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="tabular py-3.5 text-xs">{m.matter_number}</TableCell>
                  <TableCell className="max-w-sm"><Link to="/matters/$id" params={{ id: m.id }} className="font-medium hover:underline">{m.title}</Link></TableCell>
                  <TableCell>{m.clients && <Link to="/clients/$id" params={{ id: m.clients.id }} className="hover:underline">{m.clients.name}</Link>}</TableCell>
                  <TableCell className="text-muted-foreground">{areaLabel(m.practice_area)}</TableCell>
                  <TableCell className="text-muted-foreground">{m.lawyer?.full_name ?? "—"}</TableCell>
                  <TableCell><Badge variant={statusMeta(m.status).variant}>{statusMeta(m.status).label}</Badge></TableCell>
                  <TableCell className="tabular text-xs text-muted-foreground">{format(new Date(m.date_opened), "d MMM yyyy")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function SortBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-foreground">{children}<ArrowUpDown className="h-3 w-3" /></button>;
}
