import { sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

/** First-run defaults so the app is useful on day one. Idempotent: only runs on an empty DB. */
export function seedDefaults(db: BetterSQLite3Database<typeof schema>) {
  const count = db.select({ n: sql<number>`count(*)` }).from(schema.timeBlocks).get()?.n ?? 0;
  if (count > 0) return;

  db.transaction((tx) => {
    tx.insert(schema.timeBlocks)
      .values([
        { name: "Morning ritual", kind: "morning", start: "05:30", end: "09:00", sort: 1 },
        { name: "Deep work", kind: "deep_work", start: "09:00", end: "13:00", sort: 2 },
        { name: "Afternoon", kind: "afternoon", start: "13:00", end: "18:00", sort: 3 },
        { name: "Evening and personal", kind: "evening", start: "18:00", end: "21:30", sort: 4 },
        { name: "Wind-down", kind: "wind_down", start: "21:30", end: "05:30", sort: 5 },
      ])
      .run();

    const morning = tx.insert(schema.routines).values({ name: "Morning ritual", kind: "morning" }).returning().get();
    tx.insert(schema.routineSteps)
      .values(
        [
          ["Glass of water", 2],
          ["Meditate", 10],
          ["Stretch or mobility", 10],
          ["Plan today's top 3", 5],
          ["Read", 15],
        ].map(([title, minutes], i) => ({ routineId: morning.id, title: String(title), minutes: Number(minutes), sort: i })),
      )
      .run();

    const evening = tx.insert(schema.routines).values({ name: "Evening wind-down", kind: "evening" }).returning().get();
    tx.insert(schema.routineSteps)
      .values(
        [
          ["Screens off", 1],
          ["3-line journal", 5],
          ["Pick tomorrow's top 3", 5],
          ["Lay out clothes and gym bag", 5],
          ["Read in bed", 15],
        ].map(([title, minutes], i) => ({ routineId: evening.id, title: String(title), minutes: Number(minutes), sort: i })),
      )
      .run();

    tx.insert(schema.categories)
      .values(["Food", "Transport", "Home", "Health", "Fun", "Other"].map((name) => ({ name })))
      .run();
  });
}
