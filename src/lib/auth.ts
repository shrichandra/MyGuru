import crypto from "node:crypto";

// Single-user auth. Three modes, picked from the environment:
//  - "google":   Google sign-in, only ALLOWED_EMAIL may enter (production).
//  - "passcode": a passcode from APP_PASSCODE (handy before Google OAuth is set up).
//  - "open":     no auth; only allowed outside production, for local development.
export type AuthMode = "google" | "passcode" | "open" | "misconfigured";

export const SESSION_COOKIE = "mg_session";
const SESSION_DAYS = 30;

export function authMode(): AuthMode {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.ALLOWED_EMAIL) return "google";
  if (process.env.APP_PASSCODE) return "passcode";
  return process.env.NODE_ENV === "production" ? "misconfigured" : "open";
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production");
  return "dev-only-session-secret";
}

function sign(data: string): string {
  return crypto.createHmac("sha256", secret()).update(data).digest("base64url");
}

export function createSession(email: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ email, exp: now + SESSION_DAYS * 86_400_000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSession(token: string | undefined, now = Date.now()): { email: string } | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { email, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof exp !== "number" || exp < now) return null;
    return { email };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 86_400,
};

/** Constant-time compare for passcodes and bearer tokens. */
export function safeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** For machine endpoints (Cloud Scheduler jobs, Health Connect sync): `Authorization: Bearer <token>`. */
export function bearerOk(req: Request, expected: string | undefined): boolean {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  return safeEqual(token, expected);
}
