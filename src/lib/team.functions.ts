import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  fullName: z.string().trim().max(100).default(""),
  role: z.enum(["partner", "lawyer", "paralegal", "frontdesk"]),
});

export type InviteResult =
  | { ok: true; outcome: "assigned" | "emailed" | "invited"; message: string }
  | { ok: false; message: string };

/**
 * Invite someone to the firm. The partner check and the invitation record
 * happen in the database as the signed-in partner (invite_team_member); only
 * sending the invitation email uses the service role.
 */
export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inviteSchema.parse(input))
  .handler(async ({ data, context }): Promise<InviteResult> => {
    const { data: outcome, error } = await context.supabase.rpc("invite_team_member", {
      _email: data.email,
      _full_name: data.fullName,
      _role: data.role,
    });
    if (error) return { ok: false, message: error.message };
    if (outcome === "assigned") {
      return {
        ok: true,
        outcome: "assigned",
        message: `${data.email} already had an account, so they have access now.`,
      };
    }

    // Send Supabase's invitation email. It creates the account straight away,
    // and the sign-up trigger gives it the invited role.
    const origin = getRequestHeader("origin") ?? "";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: mailError } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.fullName, invited: true },
      ...(/^https?:\/\//.test(origin) ? { redirectTo: `${origin}/welcome` } : {}),
    });
    if (mailError) {
      return {
        ok: true,
        outcome: "invited",
        message: `Invitation saved, but the email couldn't be sent (${mailError.message}). Copy their invitation link from the Team page and send it to them yourself.`,
      };
    }
    return { ok: true, outcome: "emailed", message: `Invitation emailed to ${data.email}.` };
  });

/**
 * A one-time invitation link a partner can send themselves (by WhatsApp, say)
 * when the email doesn't arrive. Opening it signs the person in and starts
 * onboarding. Only for someone invited who hasn't finished joining.
 */
export const invitationLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ email: z.string().trim().toLowerCase().email().max(255) }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; link: string } | { ok: false; message: string }> => {
      const [{ data: partner }, { data: firmId }] = await Promise.all([
        context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
        context.supabase.rpc("current_firm_id"),
      ]);
      if (!partner || !firmId) return { ok: false, message: "Only a partner can do this." };
      // Only for someone invited to this firm, or in it and not yet joined.
      const { makeInvitationLink } = await import("@/lib/invitations.server");
      return makeInvitationLink(data.email, "", { firmId });
    },
  );
