import { describe, expect, it, vi } from "vitest";
import {
  fingerprint,
  outgoing,
  syncConnection,
  type AppEvent,
  type Connection,
  type Link,
  type StoredEvent,
  type SyncStore,
} from "@/lib/calendar-sync/engine";
import {
  ProviderError,
  type CalendarProvider,
  type OutgoingEvent,
  type RemoteChange,
} from "@/lib/calendar-sync/types";

// ---- In-memory stand-ins for the database and a calendar account ----------

type Ev = StoredEvent & {
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  matter_number?: string;
};

function makeStore(events: Ev[], opts: { access?: Record<string, boolean> } = {}) {
  const db = {
    events: new Map(events.map((e) => [e.id, { ...e }])),
    links: [] as (Link & { connection_id: string })[],
    conn: {} as Record<string, unknown>,
  };
  let n = 0;
  const store: SyncStore = {
    async items() {
      return [...db.events.values()].map((e): AppEvent => ({
        id: e.id,
        type: e.type,
        title: e.title + (e.matter_number ? ` · ${e.matter_number}` : ""),
        description: null,
        location: e.location,
        starts_at: e.starts_at,
        ends_at: e.ends_at,
        matter_id: e.matter_id,
        owner_id: e.owner_id,
        inquiry_id: e.inquiry_id,
      }));
    },
    async links(cid) {
      return db.links.filter((l) => l.connection_id === cid).map((l) => ({ ...l }));
    },
    async saveLink(cid, link) {
      const i = link.id
        ? db.links.findIndex((l) => l.id === link.id)
        : db.links.findIndex((l) => l.connection_id === cid && l.remote_id === link.remote_id);
      const row = { ...link, id: link.id ?? `link-${++n}`, connection_id: cid } as Link & {
        connection_id: string;
      };
      if (i >= 0) db.links[i] = { ...db.links[i]!, ...row };
      else db.links.push(row);
    },
    async deleteLink(id) {
      db.links = db.links.filter((l) => l.id !== id);
    },
    async loadEvent(id) {
      return db.events.get(id) ?? null;
    },
    async userCanAccessMatter(m) {
      return opts.access?.[m] ?? true;
    },
    async updateEvent(id, patch) {
      Object.assign(db.events.get(id)!, patch);
    },
    async createPersonalEvent(userId, ev) {
      const id = `new-${++n}`;
      db.events.set(id, {
        id,
        type: "meeting",
        title: ev.title,
        owner_id: userId,
        matter_id: null,
        inquiry_id: null,
        starts_at: ev.starts_at,
        ends_at: ev.ends_at,
        location: ev.location,
      });
      return id;
    },
    async deleteEvent(id) {
      db.events.delete(id);
      db.links.forEach((l) => {
        if (l.event_id === id) l.event_id = null;
      });
    },
    async saveConnection(_id, patch) {
      Object.assign(db.conn, patch);
    },
  };
  return { store, db };
}

function makeRemote() {
  const events = new Map<string, OutgoingEvent & { version: string }>();
  let v = 0;
  let pending: RemoteChange[] = [];
  const provider: CalendarProvider = {
    id: "google",
    authorizeUrl: () => "",
    exchangeCode: vi.fn(),
    refresh: vi.fn(async () => ({
      accessToken: "fresh",
      refreshToken: "r2",
      expiresAt: new Date(Date.now() + 3600e3).toISOString(),
    })),
    accountEmail: async () => "me@example.com",
    ensureCalendar: async (_t, id) => id ?? "cal-1",
    deleteCalendar: async () => {},
    listChanges: async () => {
      const c = pending;
      pending = [];
      return { changes: c, nextState: "state-2" };
    },
    createEvent: vi.fn(async (_t, _c, ev) => {
      const id = `r-${++v}`;
      events.set(id, { ...ev, version: `v${v}` });
      return { id, version: `v${v}` };
    }),
    updateEvent: vi.fn(async (_t, _c, id, ev) => {
      if (!events.has(id)) return null;
      events.set(id, { ...ev, version: `v${++v}` });
      return { version: `v${v}` };
    }),
    deleteEvent: vi.fn(async (_t, _c, id) => {
      events.delete(id);
    }),
  };
  // What the person does in their calendar app.
  const userEdits = (id: string, patch: Partial<OutgoingEvent>) => {
    const e = events.get(id)!;
    const next = { ...e, ...patch, version: `v${++v}` };
    events.set(id, next);
    pending.push({
      id,
      deleted: false,
      version: next.version,
      title: next.title,
      location: next.location,
      start: next.start,
      end: next.end,
      allDay: false,
      recurring: false,
    });
  };
  const userDeletes = (id: string) => {
    events.delete(id);
    pending.push({ id, deleted: true });
  };
  const userAdds = (ev: { title: string; start: string; end: string; recurring?: boolean }) => {
    const id = `user-${++v}`;
    events.set(id, { ...ev, description: null, location: null, version: `v${v}` });
    pending.push({
      id,
      deleted: false,
      version: `v${v}`,
      title: ev.title,
      location: null,
      start: ev.start,
      end: ev.end,
      allDay: false,
      recurring: !!ev.recurring,
    });
  };
  return { provider, events, userEdits, userDeletes, userAdds };
}

const USER = "user-1";
const conn = (): Connection => ({
  id: "conn-1",
  user_id: USER,
  provider: "google",
  access_token: "tok",
  refresh_token: "r",
  expires_at: new Date(Date.now() + 3600e3).toISOString(),
  calendar_id: null,
  sync_state: null,
});
const at = (h: number) => new Date(Date.UTC(2026, 10, 10, h)).toISOString();
const meeting: Ev = {
  id: "e-meet",
  type: "meeting",
  title: "Client meeting",
  owner_id: USER,
  matter_id: null,
  inquiry_id: null,
  starts_at: at(8),
  ends_at: at(9),
  location: "Boardroom",
};
const court: Ev = {
  id: "e-court",
  type: "court_date",
  title: "Pre-trial conference",
  owner_id: "someone",
  matter_id: "m-1",
  inquiry_id: null,
  starts_at: at(7),
  ends_at: null,
  location: "High Court",
  matter_number: "2026-0001",
};

async function connectedPair(events: Ev[] = [meeting, court]) {
  const s = makeStore(events);
  const r = makeRemote();
  const c = conn();
  const res = await syncConnection(r.provider, c, s.store);
  c.calendar_id = "cal-1";
  c.sync_state = "state-2";
  const remoteIdOf = (eventId: string) => s.db.links.find((l) => l.event_id === eventId)!.remote_id;
  return { ...s, ...r, c, res, remoteIdOf, sync: () => syncConnection(r.provider, c, s.store) };
}

// ---- Tests ------------------------------------------------------------------

describe("two-way calendar sync", () => {
  it("first sync copies every date into the Acta calendar, with matter numbers", async () => {
    const t = await connectedPair();
    expect(t.res).toMatchObject({ ok: true, pushed: { created: 2 } });
    expect([...t.events.values()].map((e) => e.title).sort()).toEqual([
      "Client meeting",
      "Pre-trial conference · 2026-0001",
    ]);
    expect(t.db.conn["sync_state"]).toBe("state-2");
  });

  it("a second sync with nothing changed writes nothing", async () => {
    const t = await connectedPair();
    vi.mocked(t.provider.updateEvent).mockClear();
    vi.mocked(t.provider.createEvent).mockClear();
    const res = await t.sync();
    expect(res.pushed).toEqual({ created: 0, updated: 0, removed: 0 });
    expect(t.provider.updateEvent).not.toHaveBeenCalled();
  });

  it("moving a meeting in the calendar app moves it in Acta", async () => {
    const t = await connectedPair();
    t.userEdits(t.remoteIdOf("e-meet"), { start: at(10), end: at(11), location: "Zoom" });
    const res = await t.sync();
    expect(res.pulled.updated).toBe(1);
    expect(t.db.events.get("e-meet")).toMatchObject({
      starts_at: at(10),
      ends_at: at(11),
      location: "Zoom",
    });
  });

  it("editing a court date in the calendar app is undone, Acta's date stays", async () => {
    const t = await connectedPair();
    const rid = t.remoteIdOf("e-court");
    t.userEdits(rid, { start: at(12), title: "Moved by me" });
    const res = await t.sync();
    expect(res.pulled.undone).toBe(1);
    expect(t.db.events.get("e-court")!.starts_at).toBe(at(7));
    expect(t.events.get(rid)).toMatchObject({
      start: at(7),
      title: "Pre-trial conference · 2026-0001",
    });
  });

  it("renaming a matter meeting keeps the matter number off the Acta title", async () => {
    const m: Ev = {
      ...meeting,
      id: "e-mm",
      matter_id: "m-1",
      owner_id: "other",
      matter_number: "2026-0001",
      title: "Strategy call",
    };
    const t = await connectedPair([m]);
    t.userEdits(t.remoteIdOf("e-mm"), { title: "Strategy call (moved) · 2026-0001" });
    await t.sync();
    expect(t.db.events.get("e-mm")!.title).toBe("Strategy call (moved)");
  });

  it("deleting a personal meeting there deletes it in Acta", async () => {
    const t = await connectedPair();
    t.userDeletes(t.remoteIdOf("e-meet"));
    const res = await t.sync();
    expect(res.pulled.deleted).toBe(1);
    expect(t.db.events.has("e-meet")).toBe(false);
  });

  it("deleting a matter's court date there doesn't delete it; it comes back", async () => {
    const t = await connectedPair();
    t.userDeletes(t.remoteIdOf("e-court"));
    await t.sync();
    expect(t.db.events.has("e-court")).toBe(true);
    expect([...t.events.values()].some((e) => e.title.startsWith("Pre-trial conference"))).toBe(
      true,
    );
  });

  it("a new event added to the Acta calendar becomes a personal Acta event", async () => {
    const t = await connectedPair();
    t.userAdds({ title: "Dentist", start: at(14), end: at(15) });
    const res = await t.sync();
    expect(res.pulled.created).toBe(1);
    const created = [...t.db.events.values()].find((e) => e.title === "Dentist")!;
    expect(created).toMatchObject({ type: "meeting", owner_id: USER, matter_id: null });
  });

  it("repeating series added there are left alone", async () => {
    const t = await connectedPair();
    t.userAdds({ title: "Weekly gym", start: at(6), end: at(7), recurring: true });
    const res = await t.sync();
    expect(res.pulled.skipped).toBe(1);
    expect([...t.db.events.values()].some((e) => e.title === "Weekly gym")).toBe(false);
  });

  it("changes made in Acta are written out, and deleted events are removed there", async () => {
    const t = await connectedPair();
    t.db.events.get("e-court")!.starts_at = at(9);
    t.db.events.delete("e-meet");
    const res = await t.sync();
    expect(res.pushed).toMatchObject({ updated: 1, removed: 1 });
    expect([...t.events.values()]).toHaveLength(1);
    expect([...t.events.values()][0]!.start).toBe(at(9));
  });

  it("an event deleted there but still in Acta is put back", async () => {
    const t = await connectedPair();
    const rid = t.remoteIdOf("e-court");
    t.events.delete(rid); // gone without a change notice
    t.db.events.get("e-court")!.location = "Court 2"; // forces a write, which finds it missing
    await t.sync();
    expect([...t.events.values()].some((e) => e.location === "Court 2")).toBe(true);
  });

  it("refreshes an expired access token before syncing", async () => {
    const t = await connectedPair();
    t.c.expires_at = new Date(Date.now() - 1000).toISOString();
    await t.sync();
    expect(t.provider.refresh).toHaveBeenCalledWith("r");
    expect(t.db.conn["access_token"]).toBe("fresh");
  });

  it("asks the person to reconnect when access was revoked", async () => {
    const t = await connectedPair();
    t.c.expires_at = new Date(Date.now() - 1000).toISOString();
    vi.mocked(t.provider.refresh).mockRejectedValueOnce(
      new ProviderError("invalid_grant", 400, true),
    );
    const res = await t.sync();
    expect(res).toMatchObject({ ok: false, reconnect: true });
    expect(String(t.db.conn["last_error"])).toMatch(/Connect it again/);
  });

  it("the fingerprint changes when anything Acta writes changes", () => {
    const base = outgoing({
      id: "x",
      type: "meeting",
      title: "A",
      description: null,
      location: null,
      starts_at: at(8),
      ends_at: null,
      matter_id: null,
      owner_id: USER,
      inquiry_id: null,
    });
    expect(fingerprint(base)).toBe(fingerprint({ ...base }));
    expect(fingerprint(base)).not.toBe(fingerprint({ ...base, location: "Court" }));
    expect(base.end).toBe(at(9));
  });
});
