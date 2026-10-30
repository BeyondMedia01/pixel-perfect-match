import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app-shell";
import { DocumentList } from "@/components/document-list";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({ meta: [{ title: "Documents — Docket" }, { name: "description", content: "All firm documents in Docket." }, { property: "og:title", content: "Documents — Docket" }, { property: "og:description", content: "All firm documents in Docket." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Practice" title="Documents" />
      <DocumentList />
    </div>
  ),
});
