import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [{ title: "Calendar — Docket" }, { name: "description", content: "Calendar in Docket." }] }),
  component: () => (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Calendar" />
      <EmptyState title="Calendar is coming next" body="This module is planned for the next build step." />
    </div>
  ),
});
