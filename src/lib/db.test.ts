import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openDb, schema as s, type DB } from "./db";
import { applyQuickLog } from "./quicklog-apply";
import { pulse, routinesForDate, routineStreak, peopleWithStatus, portfolioSummary, weeklyScores, sprintFor } from "./data";
import { applyHealthSync } from "./health-sync";
import { evaluateAlerts } from "./portfolio";
import { offlineBriefing, decomposeTask, draftComms } from "./guru/features";
import { addDays, today, weekStart } from "./time";

let db: DB;
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  db = openDb(":memory:");
});

describe("database", () => {
  it("migrates and seeds defaults once", () => {
    expect(db.select().from(s.timeBlocks).all()).toHaveLength(5);
    expect(db.select().from(s.routines).all().map((r) => r.kind).sort()).toEqual(["evening", "morning"]);
  });

  it("files quick logs into the right tables and the daily log", () => {
    const d = today();
    applyQuickLog(db, { type: "touchpoint", personName: "Mom", kind: "call", minutes: 25 });
    applyQuickLog(db, { type: "meal", mealType: "lunch", description: "dal rice", calories: 500 });
    applyQuickLog(db, { type: "expense", amount: 300, category: "transport", note: "uber" });
    expect(db.select().from(s.people).all().map((p) => p.name)).toEqual(["Mom"]);
    expect(db.select().from(s.expenses).get()?.amountCents).toBe(30000);
    expect(db.select().from(s.logEntries).where(eq(s.logEntries.date, d)).all()).toHaveLength(3);
    expect(pulse(db, d).lifeMinutes).toBe(25);
    expect(peopleWithStatus(db, d)[0]).toMatchObject({ name: "Mom", daysSince: 0, due: false });
  });

  it("tracks routine completion and streaks", () => {
    const d = today();
    const morning = routinesForDate(db, d).find((r) => r.kind === "morning")!;
    const ids = morning.steps.map((x) => x.id);
    for (const date of [addDays(d, -2), addDays(d, -1), d]) db.insert(s.routineRuns).values({ routineId: morning.id, date, completedStepIds: ids }).run();
    expect(routineStreak(db, morning.id, d)).toBe(3);
    expect(pulse(db, d).routine).toBeCloseTo(0.5); // morning done, evening not
  });

  it("applies Health Connect batches idempotently", () => {
    const d = today();
    const batch = {
      steps: [{ date: d, count: 9000 }],
      activeMinutes: [],
      restingHr: [],
      weight: [],
      sleep: [{ date: d, bedTime: "23:00", wakeTime: "06:30", minutes: 450 }],
      workouts: [{ id: "hc-1", date: d, title: "Running", minutes: 30, distanceKm: 5 }],
    };
    applyHealthSync(db, batch);
    const again = applyHealthSync(db, { ...batch, steps: [{ date: d, count: 9500 }] });
    expect(again.workouts).toBe(0);
    expect(db.select().from(s.workoutSessions).all()).toHaveLength(1);
    expect(db.select().from(s.healthMetrics).get()?.value).toBe(9500);
    expect(pulse(db, d).move).toBe(1);
  });

  it("computes portfolio value and fires alerts once a day", () => {
    db.insert(s.holdings)
      .values([
        { symbol: "INFY", quantity: 10, avgCostCents: 150000, priceCents: 140000, prevCloseCents: 150000, sector: "IT" },
        { symbol: "NIFTYBEES", assetClass: "etf", quantity: 100, avgCostCents: 25000, priceCents: 26000, prevCloseCents: 26000 },
      ])
      .run();
    const p = portfolioSummary(db);
    expect(p.valueCents).toBe(10 * 140000 + 100 * 26000);
    expect(p.dayChangeCents).toBe(-100000);
    db.insert(s.priceAlerts).values({ symbol: "INFY", kind: "day_drop_pct", threshold: 5 }).run();
    expect(evaluateAlerts(db)).toEqual(["INFY -6.7% today"]);
    expect(evaluateAlerts(db)).toEqual([]);
  });

  it("scores the week between 0 and 100", () => {
    const sc = weeklyScores(db, weekStart(today()));
    for (const v of Object.values(sc)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("works without an AI key: briefing, decomposition and comms drafts", async () => {
    expect(offlineBriefing(db, today())).toContain("Pick today's top 3");
    const task = db.insert(s.tasks).values({ title: "Write Q4 plan" }).returning().get();
    await decomposeTask(db, task.id);
    const subs = db.select().from(s.tasks).where(eq(s.tasks.parentId, task.id)).all();
    expect(subs.length).toBeGreaterThan(2);
    expect(subs.every((x) => (x.estimateMin ?? 0) <= 60)).toBe(true);
    db.insert(s.sprintItems).values({ date: today(), taskId: task.id }).run();
    expect(sprintFor(db, today())).toHaveLength(1);
    const doc = db.insert(s.commsDocs).values({ kind: "exec_update", title: "Weekly", fields: { bottom_line: "On track" } }).returning().get();
    const draft = await draftComms(db, doc.id);
    expect(draft).toContain("Bottom line:\nOn track");
  });
});
