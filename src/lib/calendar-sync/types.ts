/** Shared shapes for two-way calendar sync. No secrets or server imports here. */

export type ProviderId = "google" | "microsoft";

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  google: "Google Calendar",
  microsoft: "Outlook / Microsoft 365",
};

export type Tokens = {
  accessToken: string;
  refreshToken: string | null;
  /** ISO time the access token stops working. */
  expiresAt: string | null;
};

/** An event as Acta wants it to look in the person's calendar. */
export type OutgoingEvent = {
  title: string;
  description: string | null;
  location: string | null;
  start: string; // ISO
  end: string; // ISO
};

/** A change read back from the person's calendar. */
export type RemoteChange =
  | { id: string; deleted: true }
  | {
      id: string;
      deleted: false;
      version: string | null;
      title: string;
      location: string | null;
      start: string; // ISO
      end: string | null; // ISO
      allDay: boolean;
      /** Recurring series are left alone: Acta has no repeating events. */
      recurring: boolean;
    };

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** The connection must be made again (revoked access, expired refresh token). */
    readonly reconnect = false,
  ) {
    super(message);
  }
}

export interface CalendarProvider {
  id: ProviderId;
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<Tokens>;
  refresh(refreshToken: string): Promise<Tokens>;
  accountEmail(accessToken: string): Promise<string | null>;
  /** Makes (or finds) the calendar called "Acta" and returns its id. */
  ensureCalendar(accessToken: string, existingId: string | null): Promise<string>;
  deleteCalendar(accessToken: string, calendarId: string): Promise<void>;
  /** Changes since the last sync (everything on the first). */
  listChanges(
    accessToken: string,
    calendarId: string,
    state: string | null,
  ): Promise<{ changes: RemoteChange[]; nextState: string | null }>;
  createEvent(
    accessToken: string,
    calendarId: string,
    ev: OutgoingEvent,
  ): Promise<{ id: string; version: string | null }>;
  /** Returns null when the event no longer exists there. */
  updateEvent(
    accessToken: string,
    calendarId: string,
    id: string,
    ev: OutgoingEvent,
  ): Promise<{ version: string | null } | null>;
  deleteEvent(accessToken: string, calendarId: string, id: string): Promise<void>;
}
