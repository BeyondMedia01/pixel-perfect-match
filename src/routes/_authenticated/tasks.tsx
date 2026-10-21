import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({ meta: [{ title: "Tasks — Docket" }, { name: "description", content: "Tasks in Docket." }] }),
  component: () => (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Tasks" />
      <EmptyState title="Tasks is coming next" body="This module is planned for the next build step." />
    </div>
  ),
});
