# Setting up two-way calendar sync

Two-way sync lets each person connect their own Google or Microsoft account
(Settings → Calendar sync → Two-way sync). Acta then keeps a calendar called
**Acta** in that account:

- every date the person should see is written there and kept up to date;
- meetings and "other" events they move or rename there are changed in Acta;
- new events they add to the **Acta** calendar become personal Acta events;
- court dates, hearings and filing deadlines can only be changed in Acta, and an
  edit made in the calendar app is undone at the next sync.

Until this setup is done, the read-only subscription link in Settings still works
for everyone.

You need to register Acta once with Google and once with Microsoft, then add four
secrets in Lovable Cloud. You can do just one of the two.

Your site's address below is the published address people use, for example
`https://acta.revixions.com`. Every redirect URI must match it exactly.

## 1. Google

1. Go to <https://console.cloud.google.com>, create a project (for example "Acta").
2. **APIs & Services → Library**: enable **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**:
   - User type **External** (or **Internal** if everyone uses your Google Workspace).
   - App name "Acta", support email, your logo if you like.
   - Scopes: add `openid`, `email` and `https://www.googleapis.com/auth/calendar.app.created`.
     This last one only lets Acta manage calendars it creates itself; it never
     sees anyone's other calendars.
   - While the app is in **Testing**, add each person's Google address under
     **Test users**. To open it to everyone, click **Publish app**. Google may ask
     you to verify the app because calendar access is a sensitive scope.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type **Web application**.
   - Authorised redirect URI: `https://<your site>/api/calendar/oauth/google/callback`
5. Copy the **Client ID** and **Client secret**.

## 2. Microsoft (Outlook, Microsoft 365, Outlook.com)

1. Go to <https://entra.microsoft.com> → **App registrations → New registration**.
   - Name "Acta".
   - Supported account types: **Accounts in any organizational directory and
     personal Microsoft accounts** (or only your organisation's, if you prefer;
     then set `MICROSOFT_CALENDAR_TENANT` below to your tenant ID).
   - Redirect URI: platform **Web**, `https://<your site>/api/calendar/oauth/microsoft/callback`
2. **API permissions → Add a permission → Microsoft Graph → Delegated**:
   `offline_access`, `openid`, `email`, `User.Read`, `Calendars.ReadWrite`.
   If your organisation requires it, click **Grant admin consent**.
3. **Certificates & secrets → New client secret**. Copy the secret's **Value**
   (not its ID) straight away; it is only shown once. Note when it expires.
4. From **Overview**, copy the **Application (client) ID**.

## 3. Add the secrets in Lovable Cloud

In the Lovable project, open Cloud → Secrets and add:

| Name | Value |
| --- | --- |
| `GOOGLE_CALENDAR_CLIENT_ID` | Google client ID |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Google client secret |
| `MICROSOFT_CALENDAR_CLIENT_ID` | Microsoft application (client) ID |
| `MICROSOFT_CALENDAR_CLIENT_SECRET` | Microsoft client secret value |
| `MICROSOFT_CALENDAR_TENANT` | Optional. Leave unset for `common` |
| `CALENDAR_SYNC_BASE_URL` | Optional. Your site's address, if sign-ins come back to the wrong address |

Never put these in `.env` or anywhere in the code: a test fails the build if
`.env` gains anything secret.

## 4. Keep it syncing

Calendars sync when someone opens the Calendar page, when they save an event,
and when they press **Sync now**. To also sync in the background, schedule a job
in Lovable Cloud every 15 minutes:

- `POST https://<your site>/api/calendar/sync-all`
- header `Authorization: Bearer <LOVABLE_CRON_SECRET>`

## How it behaves

| Change | Where | Result |
| --- | --- | --- |
| Any change to a date | Acta | Written to everyone's connected calendar who should see it |
| Move / rename a meeting | Google / Outlook | Changed in Acta |
| Move / rename a court date, hearing or deadline | Google / Outlook | Put back to Acta's version at the next sync |
| Delete a personal meeting | Google / Outlook | Deleted in Acta |
| Delete a matter's date | Google / Outlook | Comes back at the next sync |
| Add an event to the "Acta" calendar | Google / Outlook | New personal event in Acta (only that person sees it) |
| Repeating series added there | Google / Outlook | Left alone (Acta has no repeating events) |
| Someone loses access to a matter, or is walled from it | Acta | Its dates are removed from their calendar |
| Disconnect | Acta | The "Acta" calendar is removed from their account |

Tokens are stored in tables the browser can't read (`calendar_connections`),
and only the server uses them.
