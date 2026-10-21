import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Billing — Docket" }, { name: "description", content: "Billing in Docket." }] }),
  component: () => (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Billing" />
      <EmptyState title="Billing is coming next" body="This module is planned for the next build step." />
    </div>
  ),
});
