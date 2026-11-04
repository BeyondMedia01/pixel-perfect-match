import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, differenceInCalendarDays, format, parseISO, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useMe, isPartner } from "@/lib/auth";
import { fmtHours, fmtMoney } from "@/lib/billing";
import { PRACTICE_AREAS, isDeadlineType, type EventType, type PracticeArea } from "@/lib/legal";
import { invoiceTotal } from "@/components/matter-billing";
import { PageHeader, EmptyState } from "@/components/app-shell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Acta" },
      {
        name: "description",
        content: "Work in progress, billing, matters, intake and deadlines at a glance.",
      },
      { property: "og:title", content: "Reports — Acta" },
      {
        property: "og:description",
        content: "Work in progress, billing, matters, intake and deadlines at a glance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsPage,
});

const PERIODS = [
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 365, label: "Last 12 months" },
];

function useReportData() {
  return useQuery({
    queryKey: ["reports"],
    queryFn: async () => {
      const soon = addDays(new Date(), 14).toISOString();
      const [time, invoices, matters, events, inquiries, profiles] = await Promise.all([
        supabase
          .from("time_entries")
          .select("id, user_id, matter_id, entry_date, hours, hourly_rate, billable, invoice_id"),
        supabase
          .from("invoices")
          .select(
            "id, invoice_number, status, issue_date, due_date, tax_rate, matter_id, invoice_items(quantity, unit_price), clients(name)",
          ),
        supabase
          .from("matters")
          .select("id, status, practice_area, date_opened, date_closed, responsible_lawyer_id"),
        supabase
          .from("events")
          .select(
            "id, title, type, starts_at, confirmed_by, filed_at, matter_id, matter:matters(matter_number, title)",
          )
          .gte("starts_at", new Date().toISOString())
          .lte("starts_at", soon)
          .order("starts_at"),
        supabase.from("inquiries").select("id, status, received_at"),
        supabase.from("profiles").select("id, full_name, email"),
      ]);
      return {
        time: time.data ?? [],
        invoices: invoices.data ?? [],
        matters: matters.data ?? [],
        events: (events.data ?? []).filter((e) => isDeadlineType(e.type as EventType)),
        inquiries: inquiries.data ?? [],
        profiles: profiles.data ?? [],
      };
    },
  });
}

function ReportsPage() {
  const { data: me } = useMe();
  const [days, setDays] = useState(90);
  const { data } = useReportData();

  const r = useMemo(() => {
    if (!data) return null;
    const today = new Date();
    const since = format(subDays(today, days), "yyyy-MM-dd");
    const nameOf = (id: string | null) => {
      const p = data.profiles.find((x) => x.id === id);
      return p?.full_name || p?.email || "Unassigned";
    };

    // Work in progress: billable time not yet invoiced, by person
    const wipBy = new Map<string, { hours: number; value: number }>();
    for (const t of data.time) {
      if (!t.billable || t.invoice_id) continue;
      const cur = wipBy.get(t.user_id) ?? { hours: 0, value: 0 };
      cur.hours += Number(t.hours);
      cur.value += Number(t.hours) * Number(t.hourly_rate);
      wipBy.set(t.user_id, cur);
    }
    const wip = [...wipBy.entries()]
      .map(([id, v]) => ({ id, name: nameOf(id), ...v }))
      .sort((a, b) => b.value - a.value);

    // Time logged in the period, by person
    const loggedBy = new Map<string, { billable: number; nonBillable: number; value: number }>();
    for (const t of data.time) {
      if (t.entry_date < since) continue;
      const cur = loggedBy.get(t.user_id) ?? { billable: 0, nonBillable: 0, value: 0 };
      if (t.billable) {
        cur.billable += Number(t.hours);
        cur.value += Number(t.hours) * Number(t.hourly_rate);
      } else cur.nonBillable += Number(t.hours);
      loggedBy.set(t.user_id, cur);
    }
    const logged = [...loggedBy.entries()]
      .map(([id, v]) => ({ id, name: nameOf(id), ...v }))
      .sort((a, b) => b.billable - a.billable);

    // Invoices
    const live = data.invoices.filter((i) => i.status !== "void" && i.status !== "draft");
    const billed = live
      .filter((i) => i.issue_date >= since)
      .reduce((s, i) => s + invoiceTotal(i), 0);
    const paid = live
      .filter((i) => i.status === "paid" && i.issue_date >= since)
      .reduce((s, i) => s + invoiceTotal(i), 0);
    const unpaid = data.invoices.filter((i) => i.status === "sent");
    const aging = [
      { label: "Not yet due", test: (d: number) => d <= 0 },
      { label: "1–30 days overdue", test: (d: number) => d > 0 && d <= 30 },
      { label: "31–60 days overdue", test: (d: number) => d > 30 && d <= 60 },
      { label: "Over 60 days overdue", test: (d: number) => d > 60 },
    ].map((b) => {
      const rows = unpaid.filter((i) =>
        b.test(differenceInCalendarDays(today, parseISO(i.due_date))),
      );
      return {
        label: b.label,
        count: rows.length,
        value: rows.reduce((s, i) => s + invoiceTotal(i), 0),
      };
    });
    const outstanding = aging.reduce((s, b) => s + b.value, 0);
    const overdue = aging.slice(1).reduce((s, b) => s + b.value, 0);

    // Matters
    const open = data.matters.filter((m) => m.status !== "closed");
    const openedInPeriod = data.matters.filter((m) => m.date_opened >= since).length;
    const closedInPeriod = data.matters.filter(
      (m) => m.date_closed && m.date_closed >= since,
    ).length;
    const byArea = PRACTICE_AREAS.map((a) => ({
      label: a.label,
      value: open.filter((m) => m.practice_area === (a.value as PracticeArea)).length,
    }))
      .filter((a) => a.value > 0)
      .sort((a, b) => b.value - a.value);
    const byLawyerMap = new Map<string, number>();
    for (const m of open)
      byLawyerMap.set(
        m.responsible_lawyer_id ?? "",
        (byLawyerMap.get(m.responsible_lawyer_id ?? "") ?? 0) + 1,
      );
    const byLawyer = [...byLawyerMap.entries()]
      .map(([id, value]) => ({ label: id ? nameOf(id) : "No lawyer set", value }))
      .sort((a, b) => b.value - a.value);

    // Intake
    const inq = data.inquiries.filter((i) => i.received_at.slice(0, 10) >= since);
    const intake = {
      total: inq.length,
      consult: inq.filter((i) => i.status === "consult").length,
      accepted: inq.filter((i) => i.status === "accepted").length,
      declined: inq.filter((i) => i.status === "declined").length,
      waiting: inq.filter((i) => i.status === "new").length,
    };
    const decided = intake.accepted + intake.declined;

    const deadlines = data.events.filter((e) => !e.filed_at);
    return {
      wip,
      logged,
      billed,
      paid,
      outstanding,
      overdue,
      aging,
      open,
      openedInPeriod,
      closedInPeriod,
      byArea,
      byLawyer,
      intake,
      decided,
      deadlines,
    };
  }, [data, days]);

  if (me && !isPartner(me.role))
    return (
      <EmptyState
        title="Reports are for partners"
        body="Ask a partner if you need firm-wide figures."
      />
    );

  const wipTotal = r?.wip.reduce((s, x) => s + x.value, 0) ?? 0;
  const wipHours = r?.wip.reduce((s, x) => s + x.hours, 0) ?? 0;
  const periodLabel = PERIODS.find((p) => p.days === days)!.label.toLowerCase();

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Reports"
        actions={
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-44" aria-label="Period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.days} value={String(p.days)}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      {!r ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="Work in progress"
              value={fmtMoney(wipTotal)}
              detail={`${fmtHours(wipHours)} of billable time not invoiced yet`}
            />
            <Tile
              label="Outstanding"
              value={fmtMoney(r.outstanding)}
              detail={r.overdue > 0 ? `${fmtMoney(r.overdue)} of it overdue` : "Nothing overdue"}
              tone={r.overdue > 0 ? "warn" : undefined}
            />
            <Tile
              label={`Billed, ${periodLabel}`}
              value={fmtMoney(r.billed)}
              detail={`${fmtMoney(r.paid)} of it marked paid`}
            />
            <Tile
              label="Open matters"
              value={String(r.open.length)}
              detail={`${r.openedInPeriod} opened, ${r.closedInPeriod} closed, ${periodLabel}`}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Work in progress by person" note="Billable time not yet on an invoice.">
              <BarList
                rows={r.wip.map((w) => ({
                  label: w.name,
                  value: w.value,
                  display: `${fmtMoney(w.value)} · ${fmtHours(w.hours)}`,
                }))}
                empty="No unbilled time."
              />
            </Panel>
            <Panel
              title="Money owed to the firm"
              note="Sent invoices that aren't marked paid, by how late they are."
            >
              <BarList
                rows={r.aging.map((a) => ({
                  label: a.label,
                  value: a.value,
                  display: `${fmtMoney(a.value)} · ${a.count} ${a.count === 1 ? "invoice" : "invoices"}`,
                }))}
                empty="No unpaid invoices."
              />
            </Panel>
          </div>

          <Panel title={`Time logged, ${periodLabel}`}>
            {r.logged.length === 0 ? (
              <p className="text-sm text-muted-foreground">No time logged in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Person</th>
                      <th className="py-2 pr-4 text-right font-medium">Billable</th>
                      <th className="py-2 pr-4 text-right font-medium">Non-billable</th>
                      <th className="py-2 pr-4 text-right font-medium">Billable share</th>
                      <th className="py-2 text-right font-medium">Value at rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.logged.map((l) => {
                      const total = l.billable + l.nonBillable;
                      return (
                        <tr key={l.id} className="border-b last:border-b-0">
                          <td className="py-2.5 pr-4">{l.name}</td>
                          <td className="tabular py-2.5 pr-4 text-right">{fmtHours(l.billable)}</td>
                          <td className="tabular py-2.5 pr-4 text-right text-muted-foreground">
                            {fmtHours(l.nonBillable)}
                          </td>
                          <td className="tabular py-2.5 pr-4 text-right">
                            {total ? `${Math.round((l.billable / total) * 100)}%` : "—"}
                          </td>
                          <td className="tabular py-2.5 text-right">{fmtMoney(l.value)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Open matters by practice area">
              <BarList
                rows={r.byArea.map((a) => ({
                  label: a.label,
                  value: a.value,
                  display: String(a.value),
                }))}
                empty="No open matters."
              />
            </Panel>
            <Panel title="Open matters by responsible lawyer">
              <BarList
                rows={r.byLawyer.map((a) => ({
                  label: a.label,
                  value: a.value,
                  display: String(a.value),
                }))}
                empty="No open matters."
              />
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title={`New-client inquiries, ${periodLabel}`}>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Received" value={r.intake.total} />
                <Stat label="Waiting" value={r.intake.waiting} />
                <Stat label="Consultation booked" value={r.intake.consult} />
                <Stat label="Accepted" value={r.intake.accepted} />
              </dl>
              <p className="mt-4 text-sm text-muted-foreground">
                {r.decided > 0
                  ? `${Math.round((r.intake.accepted / r.decided) * 100)}% of decided inquiries became matters (${r.intake.accepted} accepted, ${r.intake.declined} declined).`
                  : "No inquiries decided in this period yet."}
              </p>
            </Panel>
            <Panel title="Court dates and deadlines, next 14 days">
              {r.deadlines.length === 0 ? (
                <p className="text-sm text-muted-foreground">None coming up.</p>
              ) : (
                <>
                  <p className="mb-3 text-sm">
                    <span className="tabular font-semibold">{r.deadlines.length}</span> coming up
                    {r.deadlines.some((d) => !d.confirmed_by) && (
                      <>
                        ,{" "}
                        <span className="font-semibold text-warning">
                          {r.deadlines.filter((d) => !d.confirmed_by).length} not yet confirmed by a
                          lawyer
                        </span>
                      </>
                    )}
                    .
                  </p>
                  <ul className="divide-y text-sm">
                    {r.deadlines.slice(0, 6).map((d) => (
                      <li key={d.id} className="flex items-center gap-3 py-2">
                        <span className="tabular w-24 shrink-0 text-xs text-muted-foreground">
                          {format(parseISO(d.starts_at), "EEE d MMM")}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {d.matter_id ? (
                            <Link
                              to="/matters/$id"
                              params={{ id: d.matter_id }}
                              className="hover:underline"
                            >
                              {d.title}
                            </Link>
                          ) : (
                            d.title
                          )}
                          {d.matter && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {d.matter.matter_number}
                            </span>
                          )}
                        </span>
                        {!d.confirmed_by && (
                          <span className="text-xs text-warning">Unconfirmed</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Panel>
          </div>
          <p className="text-xs text-muted-foreground">
            Figures include VAT where invoices carry it. "Billed" counts sent and paid invoices
            issued in the period; Acta doesn't record payment dates yet, so "paid" uses the issue
            date.
          </p>
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "warn" | undefined;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold">{value}</p>
      <p className={"mt-1 text-xs " + (tone === "warn" ? "text-warning" : "text-muted-foreground")}>
        {detail}
      </p>
    </div>
  );
}

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {note && <p className="mb-3 text-xs text-muted-foreground">{note}</p>}
      <div className={note ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular text-xl font-semibold">{value}</dd>
    </div>
  );
}

/** Horizontal bars for one measure: one hue, longest first, value printed beside each bar. */
function BarList({
  rows,
  empty,
}: {
  rows: { label: string; value: number; display: string }[];
  empty: string;
}) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (!rows.length || max === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li
          key={r.label}
          className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-sm"
          title={`${r.label}: ${r.display}`}
        >
          <span className="truncate text-muted-foreground">{r.label}</span>
          <span className="flex items-center gap-2">
            <span
              className="h-3 rounded-r-[4px] bg-signal"
              style={{
                width: r.value > 0 ? `${Math.max(2, (r.value / max) * 100)}%` : 0,
                maxWidth: "calc(100% - 7rem)",
              }}
              aria-hidden
            />
            <span className="tabular shrink-0 text-xs">{r.display}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
