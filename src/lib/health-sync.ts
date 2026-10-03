import { z } from "zod";
import { type DB, schema as s } from "./db";
import { addLog } from "./data";

// Payload the Android wrapper posts after reading Health Connect. Dates are local YYYY-MM-DD.
export const HealthSyncSchema = z.object({
  steps: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), count: z.number().int().nonnegative() })).default([]),
  activeMinutes: z.array(z.object({ date: z.string(), minutes: z.number().nonnegative() })).default([]),
  restingHr: z.array(z.object({ date: z.string(), bpm: z.number().positive() })).default([]),
  weight: z.array(z.object({ date: z.string(), kg: z.number().positive() })).default([]),
  sleep: z
    .array(
      z.object({
        date: z.string(), // the morning the session ended
        bedTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
        wakeTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
        minutes: z.number().int().nonnegative(),
      }),
    )
    .default([]),
  workouts: z
    .array(
      z.object({
        id: z.string(), // Health Connect record id, used to dedupe
        date: z.string(),
        title: z.string(),
        minutes: z.number().nullable().optional(),
        distanceKm: z.number().nullable().optional(),
      }),
    )
    .default([]),
});
export type HealthSync = z.infer<typeof HealthSyncSchema>;

/** Idempotent upsert of a Health Connect batch. Returns counts per kind. */
export function applyHealthSync(db: DB, data: HealthSync) {
  const metric = (date: string, kind: "steps" | "active_minutes" | "resting_hr" | "weight_kg", value: number) =>
    db
      .insert(s.healthMetrics)
      .values({ date, kind, value, source: "health_connect" })
      .onConflictDoUpdate({ target: [s.healthMetrics.date, s.healthMetrics.kind, s.healthMetrics.source], set: { value } })
      .run();
  let newWorkouts = 0;
  db.transaction((tx) => {
    for (const x of data.steps) metric(x.date, "steps", x.count);
    for (const x of data.activeMinutes) metric(x.date, "active_minutes", x.minutes);
    for (const x of data.restingHr) metric(x.date, "resting_hr", x.bpm);
    for (const x of data.weight) metric(x.date, "weight_kg", x.kg);
    for (const x of data.sleep) {
      const v = { bedTime: x.bedTime ?? null, wakeTime: x.wakeTime ?? null, minutes: x.minutes };
      tx.insert(s.sleepLogs)
        .values({ date: x.date, source: "health_connect", ...v })
        .onConflictDoUpdate({ target: [s.sleepLogs.date, s.sleepLogs.source], set: v })
        .run();
    }
    for (const w of data.workouts) {
      const r = tx
        .insert(s.workoutSessions)
        .values({ date: w.date, title: w.title, minutes: w.minutes ?? null, distanceKm: w.distanceKm ?? null, source: "health_connect", externalId: w.id })
        .onConflictDoNothing({ target: s.workoutSessions.externalId })
        .returning()
        .get();
      if (r) {
        newWorkouts++;
        addLog(db, { domain: "health", kind: "workout", summary: `Workout (Health Connect): ${w.title}${w.minutes ? `, ${w.minutes} min` : ""}`, refTable: "workout_sessions", refId: r.id, date: w.date });
      }
    }
  });
  return { steps: data.steps.length, sleep: data.sleep.length, workouts: newWorkouts };
}
