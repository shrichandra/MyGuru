import { describe, expect, it } from "vitest";
import { toHealthSync } from "./health-native";

describe("toHealthSync", () => {
  it("maps Health Connect results into the sync payload", () => {
    const out = toHealthSync(
      [{ startDate: "2026-10-02T00:00:00.000Z", endDate: "2026-10-03T00:00:00.000Z", value: 8123.4 }],
      [
        {
          startDate: "2026-10-02T23:00:00.000Z",
          endDate: "2026-10-03T06:30:00.000Z",
          value: 0,
          stages: [
            { stage: "light", durationMinutes: 300 },
            { stage: "awake", durationMinutes: 20 },
            { stage: "deep", durationMinutes: 100 },
          ],
        },
      ],
      [{ workoutType: "running", duration: 1680, totalDistance: 5020, startDate: "2026-10-03T07:00:00.000Z", endDate: "2026-10-03T07:28:00.000Z", platformId: "abc" }],
    );
    expect(out.steps).toEqual([{ date: "2026-10-02", count: 8123 }]);
    expect(out.sleep).toEqual([{ date: "2026-10-03", bedTime: "23:00", wakeTime: "06:30", minutes: 400 }]);
    expect(out.workouts).toEqual([{ id: "abc", date: "2026-10-03", title: "Running", minutes: 28, distanceKm: 5 }]);
  });
});
