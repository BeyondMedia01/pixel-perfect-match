# Invitations and onboarding

Acta is invite-only. Nobody gets access by signing up.

## Inviting a firm's managing partner (Revixions)

1. In Lovable Cloud, add a secret called `ACTA_PLATFORM_KEY`. Make it long and random (at least 24 characters) and keep it private.
2. Open `/platform/invite` on the workspace (for example `https://acta.revixions.com/platform/invite`).
3. Enter the managing partner's name and email, the firm name if you know it, and the platform key.

Acta emails them an invitation. If the email can't be sent, the page shows a one-time link to send them yourself.

## What the invited person sees

The invitation opens `/welcome`:

1. **Your password:** they choose one for signing in.
2. **About you:** name, job title and phone.
3. **Your firm (partners only):** the firm name (required), address, phone, accounts email, registration number, VAT number and rate. These appear on invoices, the intake form and the sign-in page.
4. **All set:** a partner is offered "Invite your team".

Until they finish, any page in Acta sends them back to `/welcome`.

## Team members

Partners invite colleagues from the Team page. If the email doesn't arrive, **Copy invitation link** makes a one-time link to send by WhatsApp or another channel.

## Lovable Cloud settings to check

- **Authentication → allow new users to sign up:** turn this off. Invitations still work.
- **Authentication → redirect URLs:** make sure the site's `/welcome` path is allowed (a wildcard such as `https://acta.revixions.com/**` covers it).
