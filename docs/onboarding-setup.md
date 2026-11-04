# Firms, invitations and onboarding

One Acta workspace holds many law firms. Each firm only ever sees its own data. Nobody gets in by signing up: firms are created by Revixions on the platform dashboard, and people join by invitation.

## The platform dashboard (Revixions)

1. In Lovable Cloud, add a secret called `ACTA_PLATFORM_ADMINS` with the email addresses allowed in, separated by commas (for example `bechanibk@gmail.com, beyond@uncommon.org`). Each must belong to an Acta account with a confirmed email.
2. Sign in to Acta and open `/platform` (a **Platform** link also appears in the sidebar).

On the dashboard:

- **Firms:** every firm with its plan, status, number of people, next bill, money owed and last activity. **New firm** creates a firm (name, web address, plan, monthly or annual billing, free-trial days) and invites its managing partner.
- **A firm's page:** change its plan, price (or a custom price), billing dates, status and notes; invite another partner; copy a one-time sign-in link for anyone who hasn't joined; copy the firm's client intake link; suspend or restore access; create invoices and record payments.
- **Billing:** firms whose next bill falls within two weeks, every Acta invoice with its status, and recording payments (bank transfer, EcoCash, cash, card).
- **Plans:** the plans on offer, their monthly and annual prices, currency and user limit.

### What the statuses mean

| Status | Access | Notes |
| --- | --- | --- |
| Trial | Full | Until the trial end date. Partners are reminded in the last week. |
| Active | Full | |
| Overdue | Full | Partners see a banner. Goes back to Active once nothing is overdue. |
| Suspended | None | Nothing is deleted. Partners still see what they owe. |
| Cancelled | None | As suspended. |

Billing is recorded by hand: create the invoice, collect payment however you like, then **Record payment**. Changing a plan's price only affects invoices created afterwards.

## What the invited person sees

The invitation opens `/welcome`:

1. **Your password.**
2. **About you:** name, job title and phone.
3. **Your firm (partners only):** firm name (required), address, phone, accounts email, registration number, VAT number and rate. These appear on invoices, the intake form and the sign-in page.
4. **All set:** a partner is offered "Invite your team".

## Team members

Partners invite colleagues from the Team page, within their plan's user limit (everyone with access plus open invitations). If the email doesn't arrive, **Copy invitation link** makes a one-time link to send another way. A person can belong to one firm only.

## Client intake

Each firm's intake form is `/intake?firm=<web address>`. The Inquiries page and the firm's platform page copy the right link.

## Lovable Cloud settings to check

- **Authentication → allow new users to sign up:** turn this off. Invitations still work.
- **Authentication → redirect URLs:** make sure `/welcome` is allowed (a wildcard such as `https://acta.revixions.com/**` covers it).
- The old `ACTA_PLATFORM_KEY` secret is no longer used and can be deleted.
