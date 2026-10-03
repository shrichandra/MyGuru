import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";

// Liveness for Cloud Run. Touches the DB so a broken volume or migration shows up.
export async function GET() {
  getDb().run(sql`select 1`);
  return Response.json({ ok: true });
}
