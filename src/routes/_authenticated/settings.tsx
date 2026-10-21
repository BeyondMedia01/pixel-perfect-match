import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Docket" }, { name: "description", content: "Settings in Docket." }] }),
  component: () => (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Settings" />
      <EmptyState title="Settings is coming next" body="This module is planned for the next build step." />
    </div>
  ),
});
