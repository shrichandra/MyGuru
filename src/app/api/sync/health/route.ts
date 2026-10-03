import { getDb } from "@/lib/db";
import { cookies } from "next/headers";
import { authMode, bearerOk, readSession, SESSION_COOKIE } from "@/lib/auth";
import { applyHealthSync, HealthSyncSchema } from "@/lib/health-sync";

// Health Connect data arrives here from the MyGuru Android app, which loads this web app and is
// signed in (session cookie), or from any other client holding `Authorization: Bearer $HEALTH_SYNC_TOKEN`.
export async function POST(req: Request) {
  const signedIn = authMode() === "open" || Boolean(readSession((await cookies()).get(SESSION_COOKIE)?.value));
  if (!signedIn && !bearerOk(req, process.env.HEALTH_SYNC_TOKEN)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = HealthSyncSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 400 });
  return Response.json({ ok: true, applied: applyHealthSync(getDb(), parsed.data) });
}
