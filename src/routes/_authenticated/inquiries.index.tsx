import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useProfiles } from "@/lib/auth";
import { areaLabel, INQUIRY_STATUS_LABELS } from "@/lib/legal";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { NewInquiryDialog } from "@/components/inquiry-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/inquiries/")({
  head: () => ({
    meta: [
      { title: "Inquiries — Acta" },
      {
        name: "description",
        content:
          "New-client intake: log every call and walk-in, run conflict checks, book consultations.",
      },
      { property: "og:title", content: "Inquiries — Acta" },
      {
        property: "og:description",
        content:
          "New-client intake: log every call and walk-in, run conflict checks, book consultations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InquiriesPage,
});

function InquiriesPage() {
  const { data: me } = useMe();
  const { data: profiles } = useProfiles();
  const { data: inquiries } = useQuery({
    queryKey: ["inquiries"],
    queryFn: async () => {
      const [inq, matters, directory] = await Promise.all([
        supabase.from("inquiries").select("*").order("received_at", { ascending: false }),
        supabase.from("matters").select("id, matter_number"),
        // Front desk can't read matter records; for them the directory has the numbers (it's empty for everyone else).
        supabase.rpc("matter_directory"),
      ]);
      const numberByMatter = new Map(
        [...(matters.data ?? []), ...(directory.data ?? [])].map((m) => [m.id, m.matter_number]),
      );
      return (inq.data ?? []).map((i) => ({
        ...i,
        consultName: profiles?.find((p) => p.id === i.consult_with)?.full_name,
        matterNumber: i.matter_id ? numberByMatter.get(i.matter_id) : undefined,
      }));
    },
  });
  const open = (inquiries ?? []).filter((i) => i.status === "new" || i.status === "consult");
  const done = (inquiries ?? []).filter((i) => i.status === "accepted" || i.status === "declined");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="New-client intake"
        title="Inquiries"
        actions={
          me && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(`${window.location.origin}/intake`);
                    toast.success("Intake link copied");
                  } catch {
                    toast.error(
                      "Could not copy the link. Open the intake form to copy its address.",
                    );
                  }
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy intake link
              </Button>
              <Button asChild variant="outline" size="icon" title="Open intake form">
                <Link to="/intake" target="_blank" aria-label="Open intake form">
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
              <NewInquiryDialog trigger={<Button>Log an inquiry</Button>} />
            </div>
          )
        }
      />
      <p className="-mt-4 mb-8 max-w-2xl text-sm text-muted-foreground">
        Every call and walk-in is logged and conflict-checked before anyone books a consultation or
        opens a matter.
      </p>
      {inquiries?.length === 0 ? (
        <EmptyState
          title="No inquiries yet"
          body="Log the first one — the conflict check runs automatically against matters, clients and declined prospects."
          action={<NewInquiryDialog trigger={<Button>Log an inquiry</Button>} />}
        />
      ) : (
        <div className="space-y-8">
          <InquiryTable title="Open" rows={open} />
          {done.length > 0 && <InquiryTable title="Decided" rows={done} />}
        </div>
      )}
    </div>
  );
}

function InquiryTable({ title, rows }: { title: string; rows: any[] }) {
  return (
    <section>
      <h2 className="eyebrow mb-3">
        {title} ({rows.length})
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Nothing here.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {rows.map((i) => (
            <li key={i.id}>
              <Link
                to="/inquiries/$id"
                params={{ id: i.id }}
                className="flex flex-wrap items-center gap-4 px-4 py-3 text-sm hover:bg-accent/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{i.name}</span>
                  <span className="text-muted-foreground"> · {areaLabel(i.practice_area)}</span>
                  {i.opposing_party && (
                    <span className="text-muted-foreground"> · v {i.opposing_party}</span>
                  )}
                </span>
                <span className="hidden text-xs text-muted-foreground md:block">
                  {formatDistanceToNow(new Date(i.received_at), { addSuffix: true })}
                  {i.status === "consult" && i.consultName && ` · with ${i.consultName}`}
                  {i.matterNumber && <span className="tabular"> · {i.matterNumber}</span>}
                </span>
                <Badge
                  variant={
                    i.status === "declined"
                      ? "quiet"
                      : i.status === "accepted"
                        ? "closed"
                        : i.status === "new"
                          ? "intake"
                          : "hold"
                  }
                >
                  {INQUIRY_STATUS_LABELS[i.status as keyof typeof INQUIRY_STATUS_LABELS]}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
