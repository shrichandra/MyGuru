import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { completeGoogleLogin, syncCalendar } from "@/lib/calendar/google";
import { createSession, safeEqual, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const fail = (msg: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, process.env.APP_URL ?? url.origin));
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !safeEqual(state, req.cookies.get("mg_oauth_state")?.value)) return fail("Sign-in expired, try again.");

  const allowed = (process.env.ALLOWED_EMAIL ?? "").toLowerCase();
  let email: string;
  try {
    ({ email } = await completeGoogleLogin(getDb(), code, url.origin));
  } catch (e) {
    console.error(e);
    return fail("Google sign-in failed.");
  }
  if (email.toLowerCase() !== allowed) return fail("This Google account is not allowed.");

  syncCalendar(getDb()).catch((e) => console.error("calendar sync after login failed", e));
  const res = NextResponse.redirect(new URL("/", process.env.APP_URL ?? url.origin));
  res.cookies.set(SESSION_COOKIE, createSession(email), sessionCookieOptions);
  res.cookies.delete("mg_oauth_state");
  return res;
}
