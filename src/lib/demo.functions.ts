import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Demo workspace. One account per role, signed into with a button on the
 * sign-in page while demo mode is on. Only for a demo database: while it's
 * on, anyone with the site's address can look around as any of these roles.
 */

export const DEMO_ACCOUNTS = [
  {
    role: "partner",
    email: "demo.partner@example.com",
    name: "Rumbidzai Makoni",
    label: "Partner",
    blurb: "Sees the whole firm: billing, team, ethical walls, conflict sign-off.",
  },
  {
    role: "lawyer",
    email: "demo.lawyer@example.com",
    name: "Tafadzwa Chirwa",
    label: "Lawyer",
    blurb: "Runs six matters, confirms deadlines, logs time.",
  },
  {
    role: "paralegal",
    email: "demo.paralegal@example.com",
    name: "Nyasha Gumbo",
    label: "Paralegal",
    blurb: "Works on four matters, walled from one, enters deadlines.",
  },
  {
    role: "frontdesk",
    email: "demo.frontdesk@example.com",
    name: "Precious Ndlovu",
    label: "Front desk",
    blurb: "Logs inquiries, books consultations, sees matter names only.",
  },
] as const;
export type DemoRole = (typeof DEMO_ACCOUNTS)[number]["role"];

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

function newPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function requirePartner(context: {
  supabase: {
    rpc: (
      fn: "has_role",
      args: { _user_id: string; _role: "admin" },
    ) => PromiseLike<{ data: boolean | null }>;
  };
  userId: string;
}) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Only a partner can manage the demo workspace");
}

/** Public: is demo mode on, and which roles can be tried. */
export const getDemoStatus = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const db = await admin();
    const { data } = await db
      .from("demo_settings")
      .select("enabled, refreshed_at")
      .eq("id", 1)
      .maybeSingle();
    return {
      enabled: !!data?.enabled,
      refreshedAt: data?.refreshed_at ?? null,
      accounts: data?.enabled
        ? DEMO_ACCOUNTS.map(({ role, label, name, blurb }) => ({ role, label, name, blurb }))
        : [],
    };
  } catch {
    return { enabled: false, refreshedAt: null, accounts: [] };
  }
});

/** Partner: create or repair the four demo accounts, load their data and switch demo mode on. */
export const enableDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePartner(context);
    const db = await admin();
    const password = newPassword();
    const ids: Record<string, string> = {};

    for (const acct of DEMO_ACCOUNTS) {
      const { data: existing } = await db
        .from("profiles")
        .select("id")
        .eq("email", acct.email)
        .maybeSingle();
      if (existing) {
        const { error } = await db.auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
          user_metadata: { full_name: acct.name },
        });
        if (error) throw new Error(`Couldn't update ${acct.email}: ${error.message}`);
        ids[acct.role] = existing.id;
      } else {
        const { data, error } = await db.auth.admin.createUser({
          email: acct.email,
          password,
          email_confirm: true,
          user_metadata: { full_name: acct.name },
        });
        if (error || !data.user)
          throw new Error(`Couldn't create ${acct.email}: ${error?.message ?? "unknown error"}`);
        ids[acct.role] = data.user.id;
      }
      // Demo accounts skip first-time onboarding.
      await db
        .from("profiles")
        .update({ full_name: acct.name, onboarded_at: new Date().toISOString() })
        .eq("id", ids[acct.role]!);
    }

    const { error } = await db.from("demo_settings").upsert({
      id: 1,
      enabled: true,
      password,
      partner_id: ids["partner"]!,
      lawyer_id: ids["lawyer"]!,
      paralegal_id: ids["paralegal"]!,
      frontdesk_id: ids["frontdesk"]!,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    const { error: rErr } = await db.rpc("refresh_demo_data");
    if (rErr) throw new Error(rErr.message);
    await db.rpc("seed_demo_firm_profile");
    return { ok: true };
  });

/** Partner: put the demo data back the way it started, with dates around today. */
export const resetDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePartner(context);
    const db = await admin();
    const { error } = await db.rpc("refresh_demo_data");
    if (error) throw new Error(error.message);
    await db.rpc("seed_demo_firm_profile");
    return { ok: true };
  });

/** Partner: switch demo mode off. The demo accounts lose their roles and their password changes. */
export const disableDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePartner(context);
    const db = await admin();
    const { data: s } = await db.from("demo_settings").select("*").eq("id", 1).maybeSingle();
    if (!s) return { ok: true };
    const ids = [s.partner_id, s.lawyer_id, s.paralegal_id, s.frontdesk_id].filter(
      (x): x is string => !!x && x !== context.userId,
    );
    if (ids.length) await db.from("user_roles").delete().in("user_id", ids);
    for (const id of ids) await db.auth.admin.updateUserById(id, { password: newPassword() });
    await db
      .from("demo_settings")
      .update({ enabled: false, password: null, updated_at: new Date().toISOString() })
      .eq("id", 1);
    return { ok: true };
  });

/** Public while demo mode is on: sign in as one of the demo roles. Returns a session for the browser. */
export const demoSignIn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ role: z.enum(["partner", "lawyer", "paralegal", "frontdesk"]) }).parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: s } = await db.from("demo_settings").select("*").eq("id", 1).maybeSingle();
    if (!s?.enabled || !s.password)
      return { ok: false as const, message: "The demo isn't available right now." };
    const acct = DEMO_ACCOUNTS.find((a) => a.role === data.role)!;
    const userId = {
      partner: s.partner_id,
      lawyer: s.lawyer_id,
      paralegal: s.paralegal_id,
      frontdesk: s.frontdesk_id,
    }[data.role];
    if (!userId) return { ok: false as const, message: "That demo account isn't set up." };

    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const anon = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
      global: {
        // Same as the generated clients: new-style keys go in `apikey`, never as a bearer token.
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`)
            headers.delete("Authorization");
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });
    let res = await anon.auth.signInWithPassword({ email: acct.email, password: s.password });
    if (res.error) {
      // Someone may have changed the demo password from inside the demo; put it back.
      await db.auth.admin.updateUserById(userId, { password: s.password, email_confirm: true });
      res = await anon.auth.signInWithPassword({ email: acct.email, password: s.password });
    }
    if (res.error || !res.data.session)
      return { ok: false as const, message: res.error?.message ?? "Couldn't sign in to the demo." };
    return {
      ok: true as const,
      access_token: res.data.session.access_token,
      refresh_token: res.data.session.refresh_token,
    };
  });
