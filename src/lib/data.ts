import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { type DB, schema as s } from "./db";
import { addDays, inRange, isoWeekday, nowHHMM, today, weekdayOf, weekStart, daysBetween, minutesBetweenTimes } from "./time";

export type Domain = "routine" | "health" | "wealth" | "work" | "life";

export function addLog(
  db: DB,
  e: { domain: Domain; kind: string; summary: string; refTable?: string; refId?: string; date?: string },
) {
  const now = new Date();
  db.insert(s.logEntries)
    .values({
      date: e.date ?? today(now),
      at: nowHHMM(now),
      domain: e.domain,
      kind: e.kind,
      summary: e.summary,
      refTable: e.refTable,
      refId: e.refId,
    })
    .run();
}

// ---------- Time blocks ----------
export function getTimeBlocks(db: DB) {
  return db.select().from(s.timeBlocks).orderBy(asc(s.timeBlocks.sort)).all();
}

export function currentBlock(db: DB, hhmm = nowHHMM()) {
  const blocks = getTimeBlocks(db);
  return blocks.find((b) => inRange(hhmm, b.start, b.end)) ?? blocks[0] ?? null;
}

// ---------- Routines ----------
export function routinesForDate(db: DB, date: string) {
  const wd = String(weekdayOf(date));
  const rs = db.select().from(s.routines).where(eq(s.routines.active, true)).all().filter((r) => r.days.includes(wd));
  return rs.map((r) => {
    const steps = db.select().from(s.routineSteps).where(eq(s.routineSteps.routineId, r.id)).orderBy(asc(s.routineSteps.sort)).all();
    const run = db
      .select()
      .from(s.routineRuns)
      .where(and(eq(s.routineRuns.routineId, r.id), eq(s.routineRuns.date, date)))
      .get();
    const done = new Set(run?.completedStepIds ?? []);
    return { ...r, steps: steps.map((st) => ({ ...st, done: done.has(st.id) })), run, doneCount: steps.filter((st) => done.has(st.id)).length };
  });
}

export function routineCompletion(db: DB, date: string): number {
  const rs = routinesForDate(db, date);
  const total = rs.reduce((n, r) => n + r.steps.length, 0);
  const done = rs.reduce((n, r) => n + r.doneCount, 0);
  return total ? done / total : 0;
}

/** Consecutive days (ending today or yesterday) where every step of the routine was done. */
export function routineStreak(db: DB, routineId: string, date: string): number {
  const stepCount = db.select({ n: sql<number>`count(*)` }).from(s.routineSteps).where(eq(s.routineSteps.routineId, routineId)).get()?.n ?? 0;
  if (!stepCount) return 0;
  const runs = db
    .select()
    .from(s.routineRuns)
    .where(and(eq(s.routineRuns.routineId, routineId), lte(s.routineRuns.date, date)))
    .orderBy(desc(s.routineRuns.date))
    .limit(400)
    .all();
  const complete = new Set(runs.filter((r) => r.completedStepIds.length >= stepCount).map((r) => r.date));
  let d = complete.has(date) ? date : addDays(date, -1);
  let n = 0;
  while (complete.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

// ---------- Health ----------
export function sleepFor(db: DB, date: string) {
  const rows = db.select().from(s.sleepLogs).where(eq(s.sleepLogs.date, date)).all();
  const row = rows.find((r) => r.source === "health_connect") ?? rows[0];
  if (!row) return null;
  const minutes = row.minutes ?? (row.bedTime && row.wakeTime ? minutesBetweenTimes(row.bedTime, row.wakeTime) : null);
  return { ...row, minutes };
}

export function metricFor(db: DB, date: string, kind: "steps" | "active_minutes" | "resting_hr" | "weight_kg") {
  return db
    .select()
    .from(s.healthMetrics)
    .where(and(eq(s.healthMetrics.date, date), eq(s.healthMetrics.kind, kind)))
    .get()?.value ?? null;
}

export function workoutsFor(db: DB, date: string) {
  return db.select().from(s.workoutSessions).where(eq(s.workoutSessions.date, date)).all();
}

export function plannedWorkout(db: DB, date: string) {
  return db.select().from(s.workoutPlans).where(eq(s.workoutPlans.dayOfWeek, weekdayOf(date))).get() ?? null;
}

export const STEP_TARGET = Number(process.env.STEP_TARGET ?? 8000);

// ---------- Work ----------
export function sprintFor(db: DB, date: string) {
  return db
    .select({ item: s.sprintItems, task: s.tasks })
    .from(s.sprintItems)
    .innerJoin(s.tasks, eq(s.sprintItems.taskId, s.tasks.id))
    .where(eq(s.sprintItems.date, date))
    .orderBy(asc(s.sprintItems.sort))
    .all()
    .map((r) => r.task);
}

export function openTasks(db: DB) {
  return db
    .select()
    .from(s.tasks)
    .where(and(inArray(s.tasks.status, ["todo", "doing"]), isNull(s.tasks.parentId)))
    .orderBy(asc(s.tasks.dueDate), asc(s.tasks.createdAt))
    .all();
}

export function calendarFor(db: DB, date: string) {
  return db.select().from(s.calendarEvents).where(eq(s.calendarEvents.date, date)).orderBy(asc(s.calendarEvents.startAt)).all();
}

// ---------- Life ----------
export function peopleWithStatus(db: DB, date: string) {
  const ppl = db.select().from(s.people).orderBy(asc(s.people.name)).all();
  const last = db
    .select({ personId: s.touchpoints.personId, last: sql<string>`max(${s.touchpoints.date})` })
    .from(s.touchpoints)
    .groupBy(s.touchpoints.personId)
    .all();
  const lastBy = new Map(last.map((l) => [l.personId, l.last]));
  return ppl
    .map((p) => {
      const lastDate = lastBy.get(p.id) ?? null;
      const daysSince = lastDate ? daysBetween(lastDate, date) : null;
      const overdueBy = daysSince === null ? p.contactEveryDays : daysSince - p.contactEveryDays;
      return { ...p, lastDate, daysSince, due: daysSince === null || daysSince >= p.contactEveryDays, overdueBy };
    })
    .sort((a, b) => b.overdueBy - a.overdueBy);
}

export const LIFE_WEEKLY_TARGET_MIN = Number(process.env.LIFE_WEEKLY_TARGET_MIN ?? 420);

export function lifeMinutesInWeek(db: DB, date: string) {
  const ws = weekStart(date);
  const tp =
    db
      .select({ m: sql<number>`coalesce(sum(${s.touchpoints.minutes}),0)` })
      .from(s.touchpoints)
      .where(and(gte(s.touchpoints.date, ws), lte(s.touchpoints.date, date)))
      .get()?.m ?? 0;
  const hb =
    db
      .select({ m: sql<number>`coalesce(sum(${s.hobbySessions.minutes}),0)` })
      .from(s.hobbySessions)
      .where(and(gte(s.hobbySessions.date, ws), lte(s.hobbySessions.date, date)))
      .get()?.m ?? 0;
  return tp + hb;
}

// ---------- Wealth ----------
export function portfolioSummary(db: DB) {
  const hs = db.select().from(s.holdings).all();
  let value = 0;
  let prev = 0;
  let cost = 0;
  const byClass = new Map<string, number>();
  const bySector = new Map<string, number>();
  for (const h of hs) {
    const v = h.quantity * h.priceCents;
    value += v;
    prev += h.quantity * (h.prevCloseCents || h.priceCents);
    cost += h.quantity * h.avgCostCents;
    byClass.set(h.assetClass, (byClass.get(h.assetClass) ?? 0) + v);
    bySector.set(h.sector ?? "Other", (bySector.get(h.sector ?? "Other") ?? 0) + v);
  }
  const movers = hs
    .map((h) => ({ symbol: h.symbol, name: h.name, pct: h.prevCloseCents ? (h.priceCents - h.prevCloseCents) / h.prevCloseCents : 0 }))
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 5);
  return {
    holdings: hs,
    valueCents: Math.round(value),
    dayChangeCents: Math.round(value - prev),
    dayChangePct: prev ? (value - prev) / prev : 0,
    gainCents: Math.round(value - cost),
    byClass: [...byClass].map(([k, v]) => ({ name: k, valueCents: Math.round(v) })).sort((a, b) => b.valueCents - a.valueCents),
    bySector: [...bySector].map(([k, v]) => ({ name: k, valueCents: Math.round(v) })).sort((a, b) => b.valueCents - a.valueCents),
    movers,
  };
}

export function alertsFiredOn(db: DB, date: string) {
  return db.select().from(s.priceAlerts).where(eq(s.priceAlerts.lastFiredOn, date)).all();
}

export function monthSpend(db: DB, month: string) {
  return db
    .select({ categoryId: s.expenses.categoryId, cents: sql<number>`sum(${s.expenses.amountCents})` })
    .from(s.expenses)
    .where(sql`substr(${s.expenses.date},1,7) = ${month}`)
    .groupBy(s.expenses.categoryId)
    .all();
}

// ---------- Goals ----------
export function activeGoals(db: DB) {
  return db.select().from(s.goals).where(eq(s.goals.status, "active")).orderBy(asc(s.goals.deadline)).all();
}

// ---------- Pulse (the 5 rings on Today) ----------
export interface Pulse {
  routine: number; // 0..1
  move: number; // 0..1
  wealthDayPct: number | null; // signed fraction, null when no holdings
  workDone: number;
  workTotal: number;
  lifeMinutes: number;
  lifeTarget: number;
}

export function pulse(db: DB, date: string): Pulse {
  const steps = metricFor(db, date, "steps") ?? 0;
  const worked = workoutsFor(db, date).length > 0;
  const sprint = sprintFor(db, date);
  const p = portfolioSummary(db);
  return {
    routine: routineCompletion(db, date),
    move: Math.min(1, steps / STEP_TARGET * (worked ? 0.5 : 1) + (worked ? 0.5 : 0)),
    wealthDayPct: p.holdings.length ? p.dayChangePct : null,
    workDone: sprint.filter((t) => t.status === "done").length,
    workTotal: Math.max(sprint.length, 3),
    lifeMinutes: lifeMinutesInWeek(db, date),
    lifeTarget: LIFE_WEEKLY_TARGET_MIN,
  };
}

// ---------- Weekly scores (0..100 per domain) ----------
export function weeklyScores(db: DB, ws: string) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter((d) => d <= today());
  const n = days.length || 1;
  const routine = days.reduce((a, d) => a + routineCompletion(db, d), 0) / n;
  const stepsDays = days.filter((d) => (metricFor(db, d, "steps") ?? 0) >= STEP_TARGET).length;
  const workoutDays = days.filter((d) => workoutsFor(db, d).length > 0).length;
  const planned = db.select({ n: sql<number>`count(*)` }).from(s.workoutPlans).get()?.n || 3;
  const health = 0.5 * (stepsDays / n) + 0.5 * Math.min(1, workoutDays / Math.min(planned, 7));
  let sprintTotal = 0;
  let sprintDone = 0;
  for (const d of days) {
    const sp = sprintFor(db, d);
    sprintTotal += sp.length;
    sprintDone += sp.filter((t) => t.status === "done").length;
  }
  const work = sprintTotal ? sprintDone / sprintTotal : 0;
  const life = Math.min(1, lifeMinutesInWeek(db, days[days.length - 1] ?? ws) / LIFE_WEEKLY_TARGET_MIN);
  const alerts = db
    .select({ n: sql<number>`count(*)` })
    .from(s.priceAlerts)
    .where(and(gte(s.priceAlerts.lastFiredOn, ws), lte(s.priceAlerts.lastFiredOn, addDays(ws, 6))))
    .get()?.n ?? 0;
  const month = ws.slice(0, 7);
  const budgetsRows = db.select().from(s.budgets).where(eq(s.budgets.month, month)).all();
  const spend = new Map(monthSpend(db, month).map((r) => [r.categoryId, r.cents]));
  const overBudget = budgetsRows.filter((b) => (spend.get(b.categoryId) ?? 0) > b.amountCents).length;
  const wealth = Math.max(0, 1 - 0.15 * alerts - 0.15 * overBudget);
  const pct = (x: number) => Math.round(x * 100);
  return { routine: pct(routine), health: pct(health), wealth: pct(wealth), work: pct(work), life: pct(life) };
}

export function isWeekday(date = today()) {
  return weekdayOf(date) <= 5;
}

export { isoWeekday };
