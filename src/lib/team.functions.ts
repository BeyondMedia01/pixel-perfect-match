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
      const { data: partner } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (!partner) return { ok: false, message: "Only a partner can do this." };
      // Read as the partner, so the invitation rules still apply.
      const { data: invite } = await context.supabase
        .from("team_invitations")
        .select("id, full_name")
        .eq("email", data.email)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .maybeSingle();
      if (invite)
        return (await import("@/lib/invitations.server")).makeInvitationLink(
          data.email,
          invite.full_name ?? "",
        );
      // Or someone on the team who hasn't opened their invitation yet.
      const { data: member } = await context.supabase
        .from("profiles")
        .select("full_name, onboarded_at")
        .eq("email", data.email)
        .maybeSingle();
      if (member && !member.onboarded_at)
        return (await import("@/lib/invitations.server")).makeInvitationLink(
          data.email,
          member.full_name,
        );
      return { ok: false, message: "That person has already joined. They can sign in as usual." };
    },
  );
