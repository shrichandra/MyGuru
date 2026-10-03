import { eq, sql } from "drizzle-orm";
import { type DB, schema as s } from "./db";
import { addLog } from "./data";
import { describeQuickLog, type QuickLog, type QuickLogContext } from "./quicklog";
import { minutesBetweenTimes, nowHHMM, today } from "./time";

export function quickLogContext(db: DB): QuickLogContext {
  return {
    people: db.select({ n: s.people.name }).from(s.people).all().map((r) => r.n),
    hobbies: db.select({ n: s.hobbies.name }).from(s.hobbies).all().map((r) => r.n),
    categories: db.select({ n: s.categories.name }).from(s.categories).all().map((r) => r.n),
    nowHHMM: nowHHMM(),
  };
}

function findByName<T extends { name: string }>(rows: T[], name: string): T | undefined {
  const n = name.trim().toLowerCase();
  return rows.find((r) => r.name.toLowerCase() === n) ?? rows.find((r) => r.name.toLowerCase().startsWith(n) || n.startsWith(r.name.toLowerCase()));
}

/** Save a parsed quick-log entry into its table, plus a line on today's log. */
export function applyQuickLog(db: DB, q: QuickLog, date = today()): string {
  const summary = describeQuickLog(q);
  switch (q.type) {
    case "meal": {
      const r = db.insert(s.meals).values({ date, mealType: q.mealType, description: q.description, calories: q.calories }).returning().get();
      addLog(db, { domain: "health", kind: "meal", summary, refTable: "meals", refId: r.id, date });
      break;
    }
    case "workout": {
      const r = db.insert(s.workoutSessions).values({ date, title: q.title, minutes: q.minutes, distanceKm: q.distanceKm }).returning().get();
      addLog(db, { domain: "health", kind: "workout", summary, refTable: "workout_sessions", refId: r.id, date });
      break;
    }
    case "touchpoint": {
      const person =
        findByName(db.select().from(s.people).all(), q.personName) ??
        db.insert(s.people).values({ name: q.personName }).returning().get();
      const r = db.insert(s.touchpoints).values({ personId: person.id, date, kind: q.kind, minutes: q.minutes }).returning().get();
      addLog(db, { domain: "life", kind: "touchpoint", summary: describeQuickLog({ ...q, personName: person.name }), refTable: "touchpoints", refId: r.id, date });
      break;
    }
    case "expense": {
      const cat = q.category ? findByName(db.select().from(s.categories).all(), q.category) : undefined;
      const r = db
        .insert(s.expenses)
        .values({ date, amountCents: Math.round(q.amount * 100), categoryId: cat?.id ?? null, note: q.note })
        .returning()
        .get();
      addLog(db, { domain: "wealth", kind: "expense", summary, refTable: "expenses", refId: r.id, date });
      break;
    }
    case "sleep": {
      const minutes = q.minutes ?? (q.bedTime && q.wakeTime ? minutesBetweenTimes(q.bedTime, q.wakeTime) : null);
      const r = db
        .insert(s.sleepLogs)
        .values({ date, bedTime: q.bedTime, wakeTime: q.wakeTime, minutes, quality: q.quality, source: "manual" })
        .onConflictDoUpdate({
          target: [s.sleepLogs.date, s.sleepLogs.source],
          set: { bedTime: q.bedTime, wakeTime: q.wakeTime, minutes, quality: q.quality },
        })
        .returning()
        .get();
      addLog(db, { domain: "routine", kind: "sleep", summary, refTable: "sleep_logs", refId: r.id, date });
      break;
    }
    case "hobby": {
      const hobby =
        findByName(db.select().from(s.hobbies).all(), q.hobbyName) ??
        db.insert(s.hobbies).values({ name: q.hobbyName }).returning().get();
      const r = db.insert(s.hobbySessions).values({ hobbyId: hobby.id, date, minutes: q.minutes }).returning().get();
      addLog(db, { domain: "life", kind: "hobby", summary, refTable: "hobby_sessions", refId: r.id, date });
      break;
    }
    case "task": {
      const max = db.select({ m: sql<number>`coalesce(max(${s.tasks.sort}),0)` }).from(s.tasks).get()?.m ?? 0;
      const r = db.insert(s.tasks).values({ title: q.title, sort: max + 1 }).returning().get();
      addLog(db, { domain: "work", kind: "task", summary, refTable: "tasks", refId: r.id, date });
      break;
    }
    case "journal": {
      const r = db.insert(s.journalEntries).values({ date, text: q.text }).returning().get();
      addLog(db, { domain: "life", kind: "journal", summary, refTable: "journal_entries", refId: r.id, date });
      break;
    }
  }
  return summary;
}

export function deleteLogEntry(db: DB, id: string) {
  db.delete(s.logEntries).where(eq(s.logEntries.id, id)).run();
}
