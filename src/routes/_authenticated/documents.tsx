import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app-shell";
import { DocumentList } from "@/components/document-list";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({ meta: [{ title: "Documents — Docket" }, { name: "description", content: "All firm documents in Docket." }] }),
  component: () => (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Practice" title="Documents" />
      <DocumentList />
    </div>
  ),
});
