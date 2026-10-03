import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { seedDefaults } from "./seed";

export type DB = BetterSQLite3Database<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __myguruDb: DB | undefined;
}

/** Open (and migrate) a database file. Used by the app and by tests with ":memory:". */
export function openDb(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL"); // required by Litestream
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("synchronous = NORMAL");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "drizzle") });
  seedDefaults(db);
  return db;
}

export function getDb(): DB {
  if (!globalThis.__myguruDb) {
    globalThis.__myguruDb = openDb(process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "myguru.db"));
  }
  return globalThis.__myguruDb;
}

export { schema };
