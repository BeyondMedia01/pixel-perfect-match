import { describe, expect, it, vi } from "vitest";

const token = "a".repeat(64);
const rpc = vi.fn(async () => ({
  data: [
    { uid: "event-1", kind: "court_date", title: "Pre-trial conference · 2026-0001", description: "2026-0001 Mhondoro v Sable", location: "High Court", starts_at: "2026-11-10T07:00:00Z", ends_at: null, all_day_date: null, updated_at: "2026-11-01T00:00:00Z" },
    { uid: "task-2", kind: "task", title: "Task: File plea", description: null, location: null, starts_at: null, ends_at: null, all_day_date: "2026-11-12", updated_at: "2026-11-01T00:00:00Z" },
  ],
  error: null,
}));
const maybeSingle = vi.fn(async () => ({ data: { user_id: "u1", profile: { full_name: "Tendai Moyo" } }, error: null }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) },
}));

const { Route } = await import("@/routes/api/calendar.$token");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GET = (Route.options as any).server.handlers.GET as (ctx: { params: { token: string } }) => Promise<Response>;

describe("calendar subscription feed", () => {
  it("serves the person's dates as an iCalendar feed", async () => {
    const res = await GET({ params: { token: `${token}.ics` } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const body = await res.text();
    expect(rpc).toHaveBeenCalledWith("calendar_feed", { _token: token });
    expect(body).toContain("X-WR-CALNAME:Acta — Tendai Moyo");
    expect(body).toContain("SUMMARY:Pre-trial conference · 2026-0001");
    expect(body).toContain("DTSTART;VALUE=DATE:20261112");
  });

  it("rejects malformed tokens without touching the database", async () => {
    rpc.mockClear();
    const res = await GET({ params: { token: "../../etc" } });
    expect(res.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown token", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null } as never);
    const res = await GET({ params: { token } });
    expect(res.status).toBe(404);
  });
});
