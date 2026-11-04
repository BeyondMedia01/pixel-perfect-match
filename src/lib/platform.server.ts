/** Server only. Who may use the platform (Revixions) dashboard. */

/** Emails listed in the ACTA_PLATFORM_ADMINS secret, comma or space separated. */
export function platformAdminEmails(raw = process.env["ACTA_PLATFORM_ADMINS"] ?? "") {
  return new Set(
    raw
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
  );
}

/** True when the account's email is on the list and has been confirmed. */
export function isPlatformAdmin(
  user: { email?: string | null; email_confirmed_at?: string | null } | null | undefined,
  allowed = platformAdminEmails(),
) {
  const email = user?.email?.trim().toLowerCase();
  return !!email && !!user?.email_confirmed_at && allowed.has(email);
}

/** Looks the account up with the service role, so the answer can't be faked by the browser. */
export async function checkPlatformAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return isPlatformAdmin(data.user);
}
