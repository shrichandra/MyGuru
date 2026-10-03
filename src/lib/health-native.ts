import type { HealthSync } from "./health-sync";

// Shapes returned by @capgo/capacitor-health (Health Connect on Android). Kept local so the
// web bundle has no native dependency; the plugin is reached through window.Capacitor.Plugins.
export interface NativeAggregated {
  startDate: string;
  endDate: string;
  value: number;
}
export interface NativeSample {
  startDate: string;
  endDate: string;
  value: number;
  platformId?: string;
  stages?: { stage: string; durationMinutes: number }[];
}
export interface NativeWorkout {
  workoutType: string;
  duration: number; // seconds
  totalDistance?: number; // meters
  startDate: string;
  endDate: string;
  platformId?: string;
}

const localDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const localTime = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const title = (t: string) => t.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();

/** Convert plugin results into the /api/sync/health payload. Dates use the phone's local time. */
export function toHealthSync(steps: NativeAggregated[], sleep: NativeSample[], workouts: NativeWorkout[]): HealthSync {
  const sleepByDay = new Map<string, { bed: string; wake: string; minutes: number }>();
  for (const s of sleep) {
    const asleep = s.stages?.filter((x) => x.stage !== "awake" && x.stage !== "inBed").reduce((a, x) => a + x.durationMinutes, 0);
    const minutes = Math.round(asleep || (Date.parse(s.endDate) - Date.parse(s.startDate)) / 60000);
    const day = localDate(s.endDate);
    const prev = sleepByDay.get(day);
    // Naps and split sessions on the same morning add up; bed time is the earliest start.
    sleepByDay.set(day, prev ? { bed: prev.bed < s.startDate ? prev.bed : s.startDate, wake: s.endDate > prev.wake ? s.endDate : prev.wake, minutes: prev.minutes + minutes } : { bed: s.startDate, wake: s.endDate, minutes });
  }
  return {
    steps: steps.map((x) => ({ date: localDate(x.startDate), count: Math.round(x.value) })),
    activeMinutes: [],
    restingHr: [],
    weight: [],
    sleep: [...sleepByDay].map(([date, v]) => ({ date, bedTime: localTime(v.bed), wakeTime: localTime(v.wake), minutes: v.minutes })),
    workouts: workouts.map((w) => ({
      id: w.platformId ?? `${w.workoutType}-${w.startDate}`,
      date: localDate(w.startDate),
      title: title(w.workoutType),
      minutes: Math.round(w.duration / 60),
      distanceKm: w.totalDistance ? Math.round(w.totalDistance / 100) / 10 : null,
    })),
  };
}
