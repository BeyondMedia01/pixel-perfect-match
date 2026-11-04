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
      ...(/^https?:\/\//.test(origin) ? { redirectTo: `${origin}/dashboard` } : {}),
    });
    if (mailError) {
      return {
        ok: true,
        outcome: "invited",
        message: `Invitation saved, but the email couldn't be sent (${mailError.message}). Send them the sign-up link instead; they'll get access when they sign up with ${data.email}.`,
      };
    }
    return { ok: true, outcome: "emailed", message: `Invitation emailed to ${data.email}.` };
  });
