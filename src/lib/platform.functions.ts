import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Platform (Revixions) tools that work without a firm account. Protected by
 * the ACTA_PLATFORM_KEY secret, set in Lovable Cloud. With no key set, they
 * are switched off.
 */
const schema = z.object({
  key: z.string().max(200),
  email: z.string().trim().toLowerCase().email().max(255),
  fullName: z.string().trim().min(2).max(100),
  firmName: z.string().trim().max(120).default(""),
});

export type OwnerInviteResult =
  | { ok: true; outcome: "emailed" | "link" | "assigned"; message: string; link?: string }
  | { ok: false; message: string };

function sameSecret(a: string, b: string) {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Invite a firm's managing partner. They get the partner role and set the firm up on first visit. */
export const inviteFirmOwner = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }): Promise<OwnerInviteResult> => {
    const secret = process.env["ACTA_PLATFORM_KEY"] ?? "";
    if (secret.length < 24) {
      return { ok: false, message: "Platform invitations are switched off on this workspace." };
    }
    if (!sameSecret(data.key, secret)) {
      await new Promise((r) => setTimeout(r, 800));
      return { ok: false, message: "That platform key isn't right." };
    }

    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: outcome, error } = await db.rpc("platform_invite_owner", {
      _email: data.email,
      _full_name: data.fullName,
      _firm_name: data.firmName,
    });
    if (error) return { ok: false, message: error.message };
    if (outcome === "assigned") {
      return {
        ok: true,
        outcome: "assigned",
        message: `${data.email} already had an account. They're a partner now and can sign in.`,
      };
    }

    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const origin = getRequestHeader("origin") ?? "";
    const { error: mailError } = await db.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.fullName, invited: true },
      ...(/^https?:\/\//.test(origin) ? { redirectTo: `${origin}/welcome` } : {}),
    });
    if (!mailError) {
      return { ok: true, outcome: "emailed", message: `Invitation emailed to ${data.email}.` };
    }
    const { makeInvitationLink } = await import("@/lib/invitations.server");
    const link = await makeInvitationLink(data.email, data.fullName);
    if (!link.ok) {
      return {
        ok: false,
        message: `Invitation saved, but neither the email nor a link worked (${mailError.message}).`,
      };
    }
    return {
      ok: true,
      outcome: "link",
      message: `The email couldn't be sent (${mailError.message}). Send ${data.fullName} this link yourself.`,
      link: link.link,
    };
  });
