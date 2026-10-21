import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({ meta: [{ title: "Documents — Docket" }, { name: "description", content: "Documents in Docket." }] }),
  component: () => (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Documents" />
      <EmptyState title="Documents is coming next" body="This module is planned for the next build step." />
    </div>
  ),
});
