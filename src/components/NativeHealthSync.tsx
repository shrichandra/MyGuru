"use client";

import { useEffect } from "react";
import { toHealthSync, type NativeAggregated, type NativeSample, type NativeWorkout } from "@/lib/health-native";

type HealthPlugin = {
  isAvailable(): Promise<{ available: boolean }>;
  requestAuthorization(o: { read: string[] }): Promise<unknown>;
  queryAggregated(o: { dataType: string; startDate: string; endDate: string; bucket: string; aggregation: string }): Promise<{ samples: NativeAggregated[] }>;
  readSamples(o: { dataType: string; startDate: string; endDate: string; limit?: number }): Promise<{ samples: NativeSample[] }>;
  queryWorkouts(o: { startDate: string; endDate: string; limit?: number }): Promise<{ workouts: NativeWorkout[] }>;
};
type CapacitorGlobal = { isNativePlatform(): boolean; Plugins: { Health?: HealthPlugin } };

const KEY = "myguru.healthSyncedAt";
const EVERY_MS = 30 * 60 * 1000;

/** Inside the MyGuru Android app, pull the last 7 days from Health Connect and post them. */
async function sync(force = false) {
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  const health = cap?.isNativePlatform() ? cap.Plugins.Health : undefined;
  if (!health) return;
  let last = 0;
  try {
    last = Number(localStorage.getItem(KEY) ?? 0);
  } catch {}
  if (!force && Date.now() - last < EVERY_MS) return;
  if (!(await health.isAvailable()).available) return;
  await health.requestAuthorization({ read: ["steps", "sleep", "workouts"] });
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);
  const range = { startDate: start.toISOString(), endDate: end.toISOString() };
  const [steps, sleep, workouts] = await Promise.all([
    health.queryAggregated({ dataType: "steps", ...range, bucket: "day", aggregation: "sum" }),
    health.readSamples({ dataType: "sleep", ...range, limit: 200 }),
    health.queryWorkouts({ ...range, limit: 100 }),
  ]);
  const res = await fetch("/api/sync/health", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(toHealthSync(steps.samples, sleep.samples, workouts.workouts)),
  });
  if (res.ok) {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {}
  }
}

export function NativeHealthSync() {
  useEffect(() => {
    sync().catch((e) => console.warn("health sync failed", e));
    const onVisible = () => document.visibilityState === "visible" && sync().catch(() => {});
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  return null;
}
