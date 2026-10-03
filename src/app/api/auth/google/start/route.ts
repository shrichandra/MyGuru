import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { googleAuthUrl } from "@/lib/calendar/google";

export async function GET(req: NextRequest) {
  if (!process.env.GOOGLE_CLIENT_ID) return NextResponse.json({ error: "Google sign-in is not configured" }, { status: 400 });
  const state = crypto.randomBytes(16).toString("base64url");
  const res = NextResponse.redirect(googleAuthUrl(req.nextUrl.origin, state));
  res.cookies.set("mg_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
