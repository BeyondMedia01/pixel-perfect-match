/** People known to have finished onboarding this visit, so the route check runs once. */
export const onboarded = new Set<string>();

/** Invited people arrive without a password; they choose one first. */
export function needsPassword(user: {
  invited_at?: string | undefined;
  user_metadata?: Record<string, unknown>;
}) {
  const meta = user.user_metadata ?? {};
  if (meta["password_set"] === true) return false;
  return meta["invited"] === true || !!user.invited_at;
}

export const PASSWORD_MIN = 8;
