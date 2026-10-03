import { and, eq, gte, lte, notInArray } from "drizzle-orm";
import { type DB, schema as s } from "../db";
import { addDays, APP_TIMEZONE, today } from "../time";

// Google sign-in + Calendar (read-only) with the plain OAuth 2.0 web-server flow.
// One consent screen grants both, so Calendar works as soon as Shri signs in.
const SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/calendar.readonly"];

export function redirectUri(origin: string) {
  return `${process.env.APP_URL ?? origin}/api/auth/google/callback`;
}

export function googleAuthUrl(origin: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (process.env.ALLOWED_EMAIL) p.set("login_hint", process.env.ALLOWED_EMAIL);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      ...body,
    }),
  });
  if (!res.ok) throw new Error(`Google token request failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Exchange the auth code, store tokens, and return the verified email. */
export async function completeGoogleLogin(db: DB, code: string, origin: string): Promise<{ email: string; name?: string }> {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });
  const ui = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${t.access_token}` },
  });
  if (!ui.ok) throw new Error("Could not read Google profile");
  const profile = (await ui.json()) as { email: string; email_verified: boolean; name?: string };
  if (!profile.email_verified) throw new Error("Google email is not verified");
  saveTokens(db, t);
  return { email: profile.email, name: profile.name };
}

function saveTokens(db: DB, t: TokenResponse) {
  const values = {
    provider: "google",
    accessToken: t.access_token,
    expiresAt: Date.now() + (t.expires_in - 60) * 1000,
    scope: t.scope,
    ...(t.refresh_token ? { refreshToken: t.refresh_token } : {}),
  };
  db.insert(s.oauthTokens).values(values).onConflictDoUpdate({ target: s.oauthTokens.provider, set: values }).run();
}

export async function googleAccessToken(db: DB): Promise<string | null> {
  const row = db.select().from(s.oauthTokens).where(eq(s.oauthTokens.provider, "google")).get();
  if (!row) return null;
  if (row.accessToken && row.expiresAt && row.expiresAt > Date.now()) return row.accessToken;
  if (!row.refreshToken) return null;
  const t = await tokenRequest({ refresh_token: row.refreshToken, grant_type: "refresh_token" });
  saveTokens(db, t);
  return t.access_token;
}

export function calendarConnected(db: DB) {
  const row = db.select().from(s.oauthTokens).where(eq(s.oauthTokens.provider, "google")).get();
  return Boolean(row?.refreshToken && row.scope?.includes("calendar.readonly"));
}

interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

/** Local "YYYY-MM-DDTHH:MM" in the app timezone. */
function localStamp(iso: string) {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Pull the next `days` days of the primary calendar into calendar_events. */
export async function syncCalendar(db: DB, days = 7): Promise<number> {
  const token = await googleAccessToken(db);
  if (!token) return 0;
  const from = today();
  const to = addDays(from, days);
  const p = new URLSearchParams({
    timeMin: new Date(`${addDays(from, -1)}T00:00:00Z`).toISOString(),
    timeMax: new Date(`${addDays(to, 1)}T00:00:00Z`).toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    timeZone: APP_TIMEZONE,
  });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${p}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Calendar sync failed: ${res.status}`);
  const body = (await res.json()) as { items: GEvent[] };
  const rows = body.items
    .filter((e) => e.status !== "cancelled")
    .map((e) => {
      const allDay = Boolean(e.start.date);
      const startAt = allDay ? `${e.start.date}T00:00` : localStamp(e.start.dateTime!);
      const endAt = allDay ? `${e.end.date}T00:00` : localStamp(e.end.dateTime!);
      return { externalId: e.id, date: startAt.slice(0, 10), startAt, endAt, title: e.summary ?? "(no title)", location: e.location ?? null, allDay };
    })
    .filter((r) => r.date >= from && r.date <= to);
  db.transaction((tx) => {
    for (const r of rows) {
      tx.insert(s.calendarEvents).values(r).onConflictDoUpdate({ target: s.calendarEvents.externalId, set: r }).run();
    }
    // Remove events in the window that disappeared upstream.
    const ids = rows.map((r) => r.externalId);
    tx.delete(s.calendarEvents)
      .where(
        and(
          gte(s.calendarEvents.date, from),
          lte(s.calendarEvents.date, to),
          ids.length ? notInArray(s.calendarEvents.externalId, ids) : undefined,
        ),
      )
      .run();
  });
  return rows.length;
}
