import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = {
  enabled: true,
  password: "pw",
  partner_id: "p",
  lawyer_id: "l",
  paralegal_id: "a",
  frontdesk_id: "f",
};
let current: Record<string, unknown> | null = settings;
const updateUserById = vi.fn(async () => ({ error: null }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: current }) }) }),
    }),
    auth: { admin: { updateUserById } },
  },
}));
const signIn = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signInWithPassword: signIn } }),
}));

process.env["SUPABASE_URL"] = "https://example.supabase.co";
process.env["SUPABASE_PUBLISHABLE_KEY"] = "sb_publishable_x";
// Server functions run their handler directly in tests.
vi.mock("@tanstack/react-start", () => {
  const chain = () => {
    let fn: (a: { data: unknown }) => unknown;
    let validate: (i: unknown) => unknown = (i) => i;
    const b = {
      middleware: () => b,
      inputValidator: (v: (i: unknown) => unknown) => {
        validate = v;
        return b;
      },
      handler: (h: typeof fn) => {
        fn = h;
        return (opts: { data?: unknown } = {}) => fn({ data: validate(opts.data) });
      },
    };
    return b;
  };
  return { createServerFn: chain, createMiddleware: () => ({ server: () => ({}) }) };
});

const { demoSignIn } = await import("@/lib/demo.functions");
const ok = { data: { session: { access_token: "at", refresh_token: "rt" } }, error: null };

describe("demo sign-in", () => {
  beforeEach(() => {
    signIn.mockReset();
    updateUserById.mockClear();
    current = settings;
  });

  it("signs in as the chosen role and returns the session", async () => {
    signIn.mockResolvedValueOnce(ok);
    const r = await demoSignIn({ data: { role: "lawyer" } });
    expect(r).toEqual({ ok: true, access_token: "at", refresh_token: "rt" });
    expect(signIn).toHaveBeenCalledWith({ email: "demo.lawyer@example.com", password: "pw" });
  });

  it("repairs a demo password someone changed, then signs in", async () => {
    signIn
      .mockResolvedValueOnce({
        data: { session: null },
        error: { message: "Invalid login credentials" },
      })
      .mockResolvedValueOnce(ok);
    const r = await demoSignIn({ data: { role: "partner" } });
    expect(updateUserById).toHaveBeenCalledWith("p", { password: "pw", email_confirm: true });
    expect(r.ok).toBe(true);
  });

  it("refuses while demo mode is off", async () => {
    current = { ...settings, enabled: false };
    const r = await demoSignIn({ data: { role: "partner" } });
    expect(r.ok).toBe(false);
    expect(signIn).not.toHaveBeenCalled();
  });

  it("rejects unknown roles", async () => {
    await expect(
      Promise.resolve().then(() => demoSignIn({ data: { role: "admin" } } as never)),
    ).rejects.toThrow();
  });
});
