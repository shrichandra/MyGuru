import { getTableName, getTableColumns, is } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { getDb, schema } from "@/lib/db";
import { today } from "@/lib/time";

const SECRET_TABLES = new Set(["oauth_tokens", "push_subscriptions"]);

export async function GET() {
  const db = getDb();
  const out: Record<string, unknown[]> = {};
  for (const t of Object.values(schema)) {
    if (!is(t, SQLiteTable)) continue;
    const name = getTableName(t);
    if (SECRET_TABLES.has(name)) continue;
    void getTableColumns(t);
    out[name] = db.select().from(t).all();
  }
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), tables: out }, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="myguru-${today()}.json"` },
  });
}
