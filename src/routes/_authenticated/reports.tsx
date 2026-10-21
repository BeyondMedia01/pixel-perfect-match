import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — Docket" }, { name: "description", content: "Reports in Docket." }] }),
  component: () => (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Reports" />
      <EmptyState title="Reports is coming next" body="This module is planned for the next build step." />
    </div>
  ),
});
