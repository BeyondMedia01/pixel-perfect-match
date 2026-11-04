import { getRequestHeader } from "@tanstack/react-start/server";

/**
 * Server only: a sign-in link that lands on onboarding. For an account that
 * already exists (made by the invitation email) it is a sign-in link, so it is
 * only made for a confirmed account that hasn't finished joining, in the
 * expected firm, and never for a platform admin.
 */
export async function makeInvitationLink(
  email: string,
  fullName: string,
  only: { firmId?: string | null } = {},
): Promise<{ ok: true; link: string } | { ok: false; message: string }> {
  const origin = getRequestHeader("origin") ?? "";
  const redirectTo = /^https?:\/\//.test(origin) ? `${origin}/welcome` : undefined;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { platformAdminEmails } = await import("@/lib/platform.server");
  // Checked before any link is made: an invite link creates the account and signs it in.
  if (platformAdminEmails().has(email.trim().toLowerCase())) {
    return { ok: false, message: "Links can't be made for that account." };
  }
  if (only.firmId !== undefined) {
    const { data: allowed } = await supabaseAdmin.rpc("can_link_invitee", {
      _firm_id: only.firmId ?? "",
      _email: email,
    });
    if (!only.firmId || !allowed) {
      return { ok: false, message: "There's no open invitation from your firm for that email." };
    }
  }
  const invite = await supabaseAdmin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: { full_name: fullName, invited: true },
      ...(redirectTo ? { redirectTo } : {}),
    },
  });
  if (invite.data?.properties?.action_link)
    return { ok: true, link: invite.data.properties.action_link };
  // Already has an account (the invitation email made it): a sign-in link does the same job.
  const { data: acct } = await supabaseAdmin.rpc("account_by_email", { _email: email });
  const account = acct?.[0];
  if (!account) return { ok: false, message: invite.error?.message ?? "Couldn't make a link." };
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("onboarded_at")
    .eq("id", account.id)
    .maybeSingle();
  if (profile?.onboarded_at || (only.firmId !== undefined && account.firm_id !== only.firmId)) {
    return { ok: false, message: "That person has already joined. They can sign in as usual." };
  }
  const magic = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    ...(redirectTo ? { options: { redirectTo } } : {}),
  });
  if (magic.data?.properties?.action_link)
    return { ok: true, link: magic.data.properties.action_link };
  return {
    ok: false,
    message: magic.error?.message ?? invite.error?.message ?? "Couldn't make a link.",
  };
}
