import { NextResponse, type NextRequest } from "next/server";
import { authMode, readSession, SESSION_COOKIE } from "@/lib/auth";

// Paths reachable without a browser session. Machine endpoints check their own bearer tokens.
const PUBLIC = [/^\/login/, /^\/api\/auth\//, /^\/api\/jobs\//, /^\/api\/sync\//, /^\/api\/health$/, /^\/manifest/, /^\/sw\.js$/, /^\/icons\//];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();

  const mode = authMode();
  if (mode === "open") return NextResponse.next();
  if (readSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
