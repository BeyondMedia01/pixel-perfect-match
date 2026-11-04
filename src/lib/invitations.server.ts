import { getRequestHeader } from "@tanstack/react-start/server";

/** Server only: a sign-in link that lands on onboarding. */
export async function makeInvitationLink(
  email: string,
  fullName: string,
): Promise<{ ok: true; link: string } | { ok: false; message: string }> {
  const origin = getRequestHeader("origin") ?? "";
  const redirectTo = /^https?:\/\//.test(origin) ? `${origin}/welcome` : undefined;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
