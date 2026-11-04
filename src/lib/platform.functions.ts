import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * The platform (Revixions) dashboard: firms, plans and Acta's own billing.
 * Only people whose confirmed email is in the ACTA_PLATFORM_ADMINS secret get
 * in; everything here then runs with the service role.
 */
const requirePlatformAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { checkPlatformAdmin } = await import("@/lib/platform.server");
    if (!(await checkPlatformAdmin(context.userId))) throw new Error("Platform access required.");
    return next();
  });

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

const STATUSES = ["trial", "active", "past_due", "suspended", "cancelled"] as const;
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^([a-z0-9][a-z0-9-]{1,38}[a-z0-9])?$/, "Use 3–40 lowercase letters, numbers or dashes.");

/** Whether the signed-in person may open the platform dashboard. Never throws. */
export const getPlatformAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { checkPlatformAdmin } = await import("@/lib/platform.server");
    return { admin: await checkPlatformAdmin(context.userId) };
  });

export type FirmRow = {
  id: string;
  name: string;
  slug: string;
  status: (typeof STATUSES)[number];
  plan_id: string | null;
  plan_name: string | null;
  user_limit: number | null;
  billing_cycle: "monthly" | "annual";
  price: number | null;
  currency: string;
  trial_ends_at: string | null;
  next_billing_date: string | null;
  billing_email: string | null;
  notes: string | null;
  created_at: string;
  members: number;
  seats_used: number;
  matters: number;
  last_active: string | null;
  owner_email: string | null;
  amount_due: number;
  overdue: number;
};
export type Plan = {
  id: string;
  name: string;
  description: string | null;
  monthly_price: number;
  annual_price: number | null;
  currency: string;
  user_limit: number | null;
  active: boolean;
  sort_order: number;
};
export type PlatformInvoice = {
  id: string;
  firm_id: string;
  invoice_number: string;
  description: string;
  period_start: string | null;
  period_end: string | null;
  amount: number;
  currency: string;
  status: "due" | "paid" | "void";
  issued_on: string;
  due_date: string;
  paid_on: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  notes: string | null;
};

/** Everything the dashboard's overview, firms, billing and plans pages show. */
export const getPlatformData = createServerFn({ method: "GET" })
  .middleware([requirePlatformAdmin])
  .handler(async () => {
    const db = await admin();
    const [firms, plans, invoices] = await Promise.all([
      db.rpc("platform_firm_overview"),
      db.from("platform_plans").select("*").order("sort_order").order("monthly_price"),
      db.from("platform_invoices").select("*").order("issued_on", { ascending: false }).limit(1000),
    ]);
    return {
      firms: must(firms) as FirmRow[],
      plans: must(plans) as Plan[],
      invoices: must(invoices) as PlatformInvoice[],
    };
  });

/** One firm's people and invitations. */
export const getPlatformFirmPeople = createServerFn({ method: "GET" })
  .middleware([requirePlatformAdmin])
  .inputValidator((input: unknown) => z.object({ firmId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const db = await admin();
    const [people, roles, invites] = await Promise.all([
      db
        .from("profiles")
        .select("id, full_name, email, title, onboarded_at, created_at")
        .eq("firm_id", data.firmId)
        .order("created_at"),
      db.from("user_roles").select("user_id, role"),
      db
        .from("team_invitations")
        .select("id, email, full_name, role, created_at")
        .eq("firm_id", data.firmId)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .order("created_at"),
    ]);
    const roleOf = new Map((must(roles) ?? []).map((r) => [r.user_id, r.role as string]));
    return {
      people: (must(people) ?? []).map((p) => ({ ...p, role: roleOf.get(p.id) ?? null })),
      invites: must(invites) ?? [],
    };
  });

type InviteOutcome = { outcome: "emailed" | "link" | "assigned"; message: string; link?: string };

async function inviteOwner(
  firmId: string,
  email: string,
  fullName: string,
): Promise<InviteOutcome> {
  const db = await admin();
  const outcome = must(
    await db.rpc("platform_invite_owner", {
      _firm_id: firmId,
      _email: email,
      _full_name: fullName,
    }),
  );
  if (outcome === "assigned") {
    return {
      outcome: "assigned",
      message: `${email} already had an account and is now a partner.`,
    };
  }
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const origin = getRequestHeader("origin") ?? "";
  const { error } = await db.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, invited: true },
    ...(/^https?:\/\//.test(origin) ? { redirectTo: `${origin}/welcome` } : {}),
  });
  if (!error) return { outcome: "emailed", message: `Invitation emailed to ${email}.` };
  const { makeInvitationLink } = await import("@/lib/invitations.server");
  const link = await makeInvitationLink(email, fullName);
  if (!link.ok)
    throw new Error(
      `The invitation is saved, but no email or link could be made (${error.message}).`,
    );
  return {
    outcome: "link",
    message: `The email couldn't be sent (${error.message}). Send ${fullName || email} this link yourself.`,
    link: link.link,
  };
}

const newFirmSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug,
  planId: z.string().uuid().nullable(),
  billingCycle: z.enum(["monthly", "annual"]),
  trialDays: z.number().int().min(0).max(365),
  billingEmail: z.union([z.literal(""), z.string().trim().toLowerCase().email().max(255)]),
  ownerName: z.string().trim().min(2).max(100),
  ownerEmail: z.string().trim().toLowerCase().email().max(255),
});

/** Create a firm and invite its managing partner. */
export const createFirm = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .inputValidator((input: unknown) => newFirmSchema.parse(input))
  .handler(async ({ data }): Promise<InviteOutcome & { firmId: string }> => {
    const db = await admin();
    const firmId = must(
      await db.rpc("platform_create_firm", {
        _name: data.name,
        _slug: data.slug,
        _plan_id: data.planId,
        _billing_cycle: data.billingCycle,
        _trial_days: data.trialDays,
        _billing_email: data.billingEmail,
      }),
    ) as string;
    try {
      return { firmId, ...(await inviteOwner(firmId, data.ownerEmail, data.ownerName)) };
    } catch (err) {
      return {
        firmId,
        outcome: "link",
        message: `The firm was created, but the invitation failed: ${err instanceof Error ? err.message : "unknown error"}. Invite the managing partner again from the firm's page.`,
      };
    }
  });

/** Invite (another) partner to a firm, or send the first one again. */
export const invitePlatformOwner = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        firmId: z.string().uuid(),
        email: z.string().trim().toLowerCase().email().max(255),
        fullName: z.string().trim().min(2).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data }) => inviteOwner(data.firmId, data.email, data.fullName));

/** A fresh one-time sign-in link for someone who hasn't finished joining. */
export const platformInvitationLink = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .inputValidator((input: unknown) =>
    z.object({ email: z.string().trim().toLowerCase().email().max(255) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { makeInvitationLink } = await import("@/lib/invitations.server");
    return makeInvitationLink(data.email, "");
  });

/** Change a firm's details, plan, billing dates or status. */
export const updateFirm = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(2).max(120),
        slug: slug.refine((s) => s.length >= 3, "Every firm needs a web address."),
        status: z.enum(STATUSES),
        planId: z.string().uuid().nullable(),
        billingCycle: z.enum(["monthly", "annual"]),
        customPrice: z.number().min(0).max(1_000_000).nullable(),
        trialEndsAt: date,
        nextBillingDate: date,
        billingEmail: z.union([z.literal(""), z.string().trim().toLowerCase().email().max(255)]),
        notes: z.string().max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    must(
      await db
        .from("firms")
        .update({
          name: data.name,
          slug: data.slug,
          status: data.status,
          plan_id: data.planId,
          billing_cycle: data.billingCycle,
          custom_price: data.customPrice,
          trial_ends_at: data.trialEndsAt,
          next_billing_date: data.nextBillingDate,
          billing_email: data.billingEmail || null,
          notes: data.notes.trim() || null,
        })
        .eq("id", data.id),
    );
    return { ok: true };
  });

/** Pause or restore a firm's access in one step. */
export const setFirmStatus = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(STATUSES) }).parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    must(await db.from("firms").update({ status: data.status }).eq("id", data.id));
    return { ok: true };
  });

export const savePlan = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable(),
        name: z.string().trim().min(2).max(60),
        description: z.string().trim().max(300),
        monthlyPrice: z.number().min(0).max(1_000_000),
        annualPrice: z.number().min(0).max(10_000_000).nullable(),
        currency: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z]{3}$/),
        userLimit: z.number().int().min(1).max(100_000).nullable(),
        active: z.boolean(),
        sortOrder: z.number().int().min(0).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const row = {
      name: data.name,
      description: data.description || null,
      monthly_price: data.monthlyPrice,
      annual_price: data.annualPrice,
      currency: data.currency,
      user_limit: data.userLimit,
      active: data.active,
      sort_order: data.sortOrder,
    };
    if (data.id) must(await db.from("platform_plans").update(row).eq("id", data.id));
    else must(await db.from("platform_plans").insert(row));
    return { ok: true };
  });

function addCycle(iso: string, cycle: "monthly" | "annual") {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const next = new Date(
    Date.UTC(cycle === "annual" ? y + 1 : y, cycle === "annual" ? m - 1 : m, d),
  );
  return next.toISOString().slice(0, 10);
}

/** Bill a firm. With "advance", the firm's next billing date moves on one cycle. */
export const createPlatformInvoice = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        firmId: z.string().uuid(),
        description: z.string().trim().min(2).max(200),
        periodStart: date,
        periodEnd: date,
        amount: z.number().min(0).max(10_000_000),
        currency: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z]{3}$/),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        notes: z.string().max(1000),
        advance: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const number = must(await db.rpc("platform_next_invoice_number")) as string;
    must(
      await db.from("platform_invoices").insert({
        firm_id: data.firmId,
        invoice_number: number,
        description: data.description,
        period_start: data.periodStart,
        period_end: data.periodEnd,
        amount: data.amount,
        currency: data.currency,
        due_date: data.dueDate,
        notes: data.notes.trim() || null,
      }),
    );
    if (data.advance) {
      const firm = must(
        await db
          .from("firms")
          .select("billing_cycle, next_billing_date")
          .eq("id", data.firmId)
          .single(),
      );
      // The next bill starts where this one's period ends.
      const next =
        data.periodEnd ??
        (firm?.next_billing_date
          ? addCycle(firm.next_billing_date, firm.billing_cycle as "monthly" | "annual")
          : null);
      if (next)
        must(await db.from("firms").update({ next_billing_date: next }).eq("id", data.firmId));
    }
    return { ok: true, invoiceNumber: number };
  });

/** Record a payment. A firm that was only overdue goes back to active once nothing is overdue. */
export const recordPlatformPayment = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        invoiceId: z.string().uuid(),
        paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        method: z.string().trim().min(2).max(60),
        reference: z.string().trim().max(120),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const inv = must(
      await db
        .from("platform_invoices")
        .update({
          status: "paid",
          paid_on: data.paidOn,
          payment_method: data.method,
          payment_reference: data.reference || null,
        })
        .eq("id", data.invoiceId)
        .eq("status", "due")
        .select("firm_id")
        .maybeSingle(),
    );
    if (!inv) throw new Error("That invoice isn't waiting for payment.");
    const today = new Date().toISOString().slice(0, 10);
    const { count } = await db
      .from("platform_invoices")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", inv.firm_id)
      .eq("status", "due")
      .lt("due_date", today);
    if (!count) {
      await db
        .from("firms")
        .update({ status: "active" })
        .eq("id", inv.firm_id)
        .eq("status", "past_due");
    }
    return { ok: true };
  });

export const voidPlatformInvoice = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .inputValidator((input: unknown) => z.object({ invoiceId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const db = await admin();
    must(
      await db
        .from("platform_invoices")
        .update({ status: "void" })
        .eq("id", data.invoiceId)
        .eq("status", "due"),
    );
    return { ok: true };
  });
