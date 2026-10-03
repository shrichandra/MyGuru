"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getDb, schema as s } from "@/lib/db";
import { addLog, sprintFor } from "@/lib/data";
import { today, weekStart } from "@/lib/time";
import { parseLog, runBriefing, decomposeTask, draftComms, weeklySummary } from "@/lib/guru/features";
import { applyQuickLog, quickLogContext, deleteLogEntry } from "@/lib/quicklog-apply";
import { QuickLogSchema, describeQuickLog, type QuickLog } from "@/lib/quicklog";
import { refreshPortfolio } from "@/lib/portfolio";
import { syncCalendar } from "@/lib/calendar/google";
import { createSession, safeEqual, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import type { CommsKind } from "@/lib/comms";
import { COMMS_TEMPLATES } from "@/lib/comms";

const db = () => getDb();
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optStr = (f: FormData, k: string) => str(f, k) || null;
const optNum = (f: FormData, k: string) => (str(f, k) === "" ? null : Number(str(f, k)));
const cents = (f: FormData, k: string) => Math.round(Number(str(f, k) || 0) * 100);
const done = () => revalidatePath("/", "layout");

// ---------- Auth ----------
export async function passcodeLogin(_: unknown, f: FormData) {
  if (!safeEqual(str(f, "passcode"), process.env.APP_PASSCODE)) return { error: "Wrong passcode" };
  (await cookies()).set(SESSION_COOKIE, createSession("owner"), sessionCookieOptions);
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ---------- Quick log ----------
export async function previewQuickLog(text: string): Promise<{ entry: QuickLog; summary: string } | { error: string }> {
  if (!text.trim()) return { error: "Type something to log" };
  try {
    const entry = await parseLog(db(), text, quickLogContext(db()));
    return { entry, summary: describeQuickLog(entry) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not parse that" };
  }
}

export async function saveQuickLog(entry: QuickLog) {
  const parsed = QuickLogSchema.parse(entry);
  const summary = applyQuickLog(db(), parsed);
  done();
  return summary;
}

export async function removeLogEntry(id: string) {
  deleteLogEntry(db(), id);
  done();
}

// ---------- Guru ----------
export async function refreshBriefing() {
  await runBriefing(db(), today());
  done();
}

export async function rateGuruRun(id: string, rating: number) {
  db().update(s.guruRuns).set({ rating }).where(eq(s.guruRuns.id, id)).run();
  done();
}

// ---------- Time blocks ----------
export async function updateTimeBlock(f: FormData) {
  db().update(s.timeBlocks).set({ name: str(f, "name"), start: str(f, "start"), end: str(f, "end") }).where(eq(s.timeBlocks.id, str(f, "id"))).run();
  done();
}

// ---------- Routines ----------
export async function toggleRoutineStep(routineId: string, stepId: string, date = today()) {
  const d = db();
  const run = d.select().from(s.routineRuns).where(and(eq(s.routineRuns.routineId, routineId), eq(s.routineRuns.date, date))).get();
  const set = new Set(run?.completedStepIds ?? []);
  if (set.has(stepId)) set.delete(stepId);
  else set.add(stepId);
  const steps = d.select().from(s.routineSteps).where(eq(s.routineSteps.routineId, routineId)).all();
  const finished = steps.length > 0 && steps.every((st) => set.has(st.id));
  const values = { completedStepIds: [...set], finishedAt: finished ? new Date().toISOString() : null };
  if (run) d.update(s.routineRuns).set(values).where(eq(s.routineRuns.id, run.id)).run();
  else d.insert(s.routineRuns).values({ routineId, date, ...values }).run();
  if (finished && !run?.finishedAt) {
    const r = d.select().from(s.routines).where(eq(s.routines.id, routineId)).get();
    addLog(d, { domain: "routine", kind: "routine_done", summary: `Finished ${r?.name ?? "routine"}`, refTable: "routines", refId: routineId, date });
  }
  done();
}

export async function createRoutine(f: FormData) {
  const r = db()
    .insert(s.routines)
    .values({ name: str(f, "name"), kind: (str(f, "kind") || "custom") as "morning" | "evening" | "custom", days: str(f, "days") || "1234567" })
    .returning()
    .get();
  done();
  redirect(`/plan/routines/${r.id}`);
}

export async function updateRoutine(f: FormData) {
  const days = f.getAll("day").map(String).sort().join("");
  db()
    .update(s.routines)
    .set({ name: str(f, "name"), days: days || "1234567", active: f.get("active") === "on" })
    .where(eq(s.routines.id, str(f, "id")))
    .run();
  done();
}

export async function deleteRoutine(f: FormData) {
  db().delete(s.routines).where(eq(s.routines.id, str(f, "id"))).run();
  done();
  redirect("/plan");
}

export async function addRoutineStep(f: FormData) {
  const routineId = str(f, "routineId");
  const max = db().select({ m: sql<number>`coalesce(max(${s.routineSteps.sort}),-1)` }).from(s.routineSteps).where(eq(s.routineSteps.routineId, routineId)).get()?.m ?? -1;
  db().insert(s.routineSteps).values({ routineId, title: str(f, "title"), minutes: optNum(f, "minutes") ?? 5, sort: max + 1 }).run();
  done();
}

export async function deleteRoutineStep(f: FormData) {
  db().delete(s.routineSteps).where(eq(s.routineSteps.id, str(f, "id"))).run();
  done();
}

export async function moveRoutineStep(f: FormData) {
  const d = db();
  const step = d.select().from(s.routineSteps).where(eq(s.routineSteps.id, str(f, "id"))).get();
  if (!step) return;
  const steps = d.select().from(s.routineSteps).where(eq(s.routineSteps.routineId, step.routineId)).orderBy(s.routineSteps.sort).all();
  const i = steps.findIndex((x) => x.id === step.id);
  const j = str(f, "dir") === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= steps.length) return;
  [steps[i], steps[j]] = [steps[j], steps[i]];
  d.transaction((tx) => steps.forEach((x, k) => tx.update(s.routineSteps).set({ sort: k }).where(eq(s.routineSteps.id, x.id)).run()));
  done();
}

// ---------- Habits ----------
export async function createHabit(f: FormData) {
  db().insert(s.habits).values({ name: str(f, "name"), targetPerWeek: optNum(f, "targetPerWeek") ?? 7 }).run();
  done();
}

export async function toggleHabit(habitId: string, date = today()) {
  const d = db();
  const row = d.select().from(s.habitCheckins).where(and(eq(s.habitCheckins.habitId, habitId), eq(s.habitCheckins.date, date))).get();
  if (row) d.delete(s.habitCheckins).where(eq(s.habitCheckins.id, row.id)).run();
  else d.insert(s.habitCheckins).values({ habitId, date }).run();
  done();
}

export async function deleteHabit(f: FormData) {
  db().delete(s.habits).where(eq(s.habits.id, str(f, "id"))).run();
  done();
}

// ---------- Sleep ----------
export async function logSleep(f: FormData) {
  applyQuickLog(db(), {
    type: "sleep",
    bedTime: optStr(f, "bedTime"),
    wakeTime: optStr(f, "wakeTime"),
    minutes: null,
    quality: optNum(f, "quality"),
  }, str(f, "date") || today());
  done();
}

// ---------- Health ----------
export async function addWorkoutPlan(f: FormData) {
  db().insert(s.workoutPlans).values({ dayOfWeek: Number(str(f, "dayOfWeek")), title: str(f, "title"), details: optStr(f, "details") }).run();
  done();
}

export async function deleteWorkoutPlan(f: FormData) {
  db().delete(s.workoutPlans).where(eq(s.workoutPlans.id, str(f, "id"))).run();
  done();
}

export async function logWorkout(f: FormData) {
  const d = db();
  const date = str(f, "date") || today();
  const w = d
    .insert(s.workoutSessions)
    .values({ date, title: str(f, "title"), minutes: optNum(f, "minutes"), distanceKm: optNum(f, "distanceKm"), notes: optStr(f, "notes"), planId: optStr(f, "planId") })
    .returning()
    .get();
  const exercise = str(f, "exercise");
  if (exercise) {
    d.insert(s.exerciseSets).values({ sessionId: w.id, exercise, sets: optNum(f, "sets"), reps: optNum(f, "reps"), weightKg: optNum(f, "weightKg") }).run();
  }
  addLog(d, { domain: "health", kind: "workout", summary: `Workout: ${w.title}${w.minutes ? `, ${w.minutes} min` : ""}`, refTable: "workout_sessions", refId: w.id, date });
  done();
}

export async function addExerciseSet(f: FormData) {
  db().insert(s.exerciseSets).values({ sessionId: str(f, "sessionId"), exercise: str(f, "exercise"), sets: optNum(f, "sets"), reps: optNum(f, "reps"), weightKg: optNum(f, "weightKg"), minutes: optNum(f, "minutes") }).run();
  done();
}

export async function deleteWorkout(f: FormData) {
  db().delete(s.workoutSessions).where(eq(s.workoutSessions.id, str(f, "id"))).run();
  done();
}

export async function logMeal(f: FormData) {
  const d = db();
  const date = str(f, "date") || today();
  const m = d
    .insert(s.meals)
    .values({
      date,
      mealType: str(f, "mealType") as "breakfast" | "lunch" | "dinner" | "snack",
      description: str(f, "description"),
      calories: optNum(f, "calories"),
      proteinG: optNum(f, "proteinG"),
      carbsG: optNum(f, "carbsG"),
      fatG: optNum(f, "fatG"),
    })
    .returning()
    .get();
  addLog(d, { domain: "health", kind: "meal", summary: `${m.mealType}: ${m.description}`, refTable: "meals", refId: m.id, date });
  done();
}

export async function deleteMeal(f: FormData) {
  db().delete(s.meals).where(eq(s.meals.id, str(f, "id"))).run();
  done();
}

export async function addMealPlan(f: FormData) {
  db().insert(s.mealPlans).values({ dayOfWeek: Number(str(f, "dayOfWeek")), mealType: str(f, "mealType") as "lunch", description: str(f, "description") }).run();
  done();
}

export async function deleteMealPlan(f: FormData) {
  db().delete(s.mealPlans).where(eq(s.mealPlans.id, str(f, "id"))).run();
  done();
}

// ---------- Wealth ----------
export async function upsertHolding(f: FormData) {
  const values = {
    symbol: str(f, "symbol").toUpperCase(),
    name: optStr(f, "name"),
    assetClass: str(f, "assetClass") || "equity",
    sector: optStr(f, "sector"),
    quantity: Number(str(f, "quantity")),
    avgCostCents: cents(f, "avgCost"),
    priceCents: cents(f, "price"),
    prevCloseCents: str(f, "prevClose") ? cents(f, "prevClose") : cents(f, "price"),
  };
  db().insert(s.holdings).values(values).onConflictDoUpdate({ target: s.holdings.symbol, set: values }).run();
  done();
}

export async function updatePrice(f: FormData) {
  const d = db();
  const h = d.select().from(s.holdings).where(eq(s.holdings.id, str(f, "id"))).get();
  if (!h) return;
  // Moving to a new trading day: today's previous close is the last known price.
  const newDay = f.get("newDay") === "on";
  d.update(s.holdings)
    .set({ priceCents: cents(f, "price"), prevCloseCents: newDay ? h.priceCents : h.prevCloseCents })
    .where(eq(s.holdings.id, h.id))
    .run();
  done();
}

export async function deleteHolding(f: FormData) {
  db().delete(s.holdings).where(eq(s.holdings.id, str(f, "id"))).run();
  done();
}

export async function addAlert(f: FormData) {
  db()
    .insert(s.priceAlerts)
    .values({ symbol: optStr(f, "symbol")?.toUpperCase() ?? null, kind: str(f, "kind") as "day_drop_pct", threshold: Number(str(f, "threshold")) })
    .run();
  done();
}

export async function deleteAlert(f: FormData) {
  db().delete(s.priceAlerts).where(eq(s.priceAlerts.id, str(f, "id"))).run();
  done();
}

export async function runPortfolioRefresh() {
  await refreshPortfolio(db());
  done();
}

export async function addExpense(f: FormData) {
  const d = db();
  const date = str(f, "date") || today();
  const e = d.insert(s.expenses).values({ date, amountCents: cents(f, "amount"), categoryId: optStr(f, "categoryId"), note: optStr(f, "note") }).returning().get();
  addLog(d, { domain: "wealth", kind: "expense", summary: `Expense ${str(f, "amount")}${e.note ? `: ${e.note}` : ""}`, refTable: "expenses", refId: e.id, date });
  done();
}

export async function deleteExpense(f: FormData) {
  db().delete(s.expenses).where(eq(s.expenses.id, str(f, "id"))).run();
  done();
}

export async function setBudget(f: FormData) {
  const values = { categoryId: str(f, "categoryId"), month: str(f, "month"), amountCents: cents(f, "amount") };
  db().insert(s.budgets).values(values).onConflictDoUpdate({ target: [s.budgets.categoryId, s.budgets.month], set: { amountCents: values.amountCents } }).run();
  done();
}

export async function addFinanceGoal(f: FormData) {
  db().insert(s.financeGoals).values({ title: str(f, "title"), targetCents: cents(f, "target"), deadline: optStr(f, "deadline") }).run();
  done();
}

export async function deleteFinanceGoal(f: FormData) {
  db().delete(s.financeGoals).where(eq(s.financeGoals.id, str(f, "id"))).run();
  done();
}

// ---------- Work ----------
export async function createProject(f: FormData) {
  db().insert(s.projects).values({ name: str(f, "name"), description: optStr(f, "description") }).run();
  done();
}

export async function setProjectStatus(f: FormData) {
  db().update(s.projects).set({ status: str(f, "status") as "active" }).where(eq(s.projects.id, str(f, "id"))).run();
  done();
}

export async function createTask(f: FormData) {
  const max = db().select({ m: sql<number>`coalesce(max(${s.tasks.sort}),0)` }).from(s.tasks).get()?.m ?? 0;
  db()
    .insert(s.tasks)
    .values({ title: str(f, "title"), projectId: optStr(f, "projectId"), parentId: optStr(f, "parentId"), dueDate: optStr(f, "dueDate"), estimateMin: optNum(f, "estimateMin"), sort: max + 1 })
    .run();
  done();
}

export async function setTaskStatus(id: string, status: "todo" | "doing" | "done") {
  const d = db();
  const t = d.select().from(s.tasks).where(eq(s.tasks.id, id)).get();
  if (!t) return;
  d.update(s.tasks).set({ status, completedAt: status === "done" ? new Date().toISOString() : null }).where(eq(s.tasks.id, id)).run();
  if (status === "done" && t.status !== "done") addLog(d, { domain: "work", kind: "task_done", summary: `Done: ${t.title}`, refTable: "tasks", refId: id });
  done();
}

export async function deleteTask(f: FormData) {
  const d = db();
  const id = str(f, "id");
  d.delete(s.tasks).where(eq(s.tasks.parentId, id)).run();
  d.delete(s.tasks).where(eq(s.tasks.id, id)).run();
  done();
}

export async function toggleSprint(taskId: string, date = today()) {
  const d = db();
  const row = d.select().from(s.sprintItems).where(and(eq(s.sprintItems.date, date), eq(s.sprintItems.taskId, taskId))).get();
  if (row) d.delete(s.sprintItems).where(eq(s.sprintItems.id, row.id)).run();
  else {
    const current = sprintFor(d, date);
    if (current.length >= 3) return { error: "Today's sprint already has 3 tasks" };
    d.insert(s.sprintItems).values({ date, taskId, sort: current.length }).run();
  }
  done();
  return {};
}

export async function breakDownTask(taskId: string) {
  try {
    await decomposeTask(db(), taskId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not break this task down" };
  }
  done();
  return {};
}

export async function createCommsDoc(f: FormData) {
  const kind = str(f, "kind") as CommsKind;
  const fields: Record<string, string> = {};
  for (const fl of COMMS_TEMPLATES[kind].fields) fields[fl.key] = "";
  const doc = db()
    .insert(s.commsDocs)
    .values({ kind, title: str(f, "title") || COMMS_TEMPLATES[kind].name, projectId: optStr(f, "projectId"), meetingAt: optStr(f, "meetingAt"), fields })
    .returning()
    .get();
  done();
  redirect(`/work/comms/${doc.id}`);
}

export async function saveCommsDoc(f: FormData) {
  const d = db();
  const id = str(f, "id");
  const doc = d.select().from(s.commsDocs).where(eq(s.commsDocs.id, id)).get();
  if (!doc) return;
  const fields: Record<string, string> = {};
  for (const fl of COMMS_TEMPLATES[doc.kind].fields) fields[fl.key] = str(f, `field_${fl.key}`);
  d.update(s.commsDocs)
    .set({ title: str(f, "title") || doc.title, fields, draft: f.has("draft") ? str(f, "draft") : doc.draft, projectId: optStr(f, "projectId"), meetingAt: optStr(f, "meetingAt") })
    .where(eq(s.commsDocs.id, id))
    .run();
  if (f.get("intent") === "draft") {
    try {
      await draftComms(d, id);
    } catch (e) {
      console.error(e);
    }
  }
  done();
}

export async function deleteCommsDoc(f: FormData) {
  db().delete(s.commsDocs).where(eq(s.commsDocs.id, str(f, "id"))).run();
  done();
  redirect("/work");
}

export async function runCalendarSync() {
  try {
    await syncCalendar(db());
  } catch (e) {
    console.error(e);
  }
  done();
}

// ---------- Life ----------
export async function createPerson(f: FormData) {
  db().insert(s.people).values({ name: str(f, "name"), relation: optStr(f, "relation"), contactEveryDays: optNum(f, "contactEveryDays") ?? 14, birthday: optStr(f, "birthday") }).run();
  done();
}

export async function deletePerson(f: FormData) {
  db().delete(s.people).where(eq(s.people.id, str(f, "id"))).run();
  done();
}

export async function logTouchpoint(f: FormData) {
  const d = db();
  const p = d.select().from(s.people).where(eq(s.people.id, str(f, "personId"))).get();
  if (!p) return;
  applyQuickLog(d, { type: "touchpoint", personName: p.name, kind: (str(f, "kind") || "call") as "call", minutes: optNum(f, "minutes") ?? 0 }, str(f, "date") || today());
  done();
}

export async function createHobby(f: FormData) {
  db().insert(s.hobbies).values({ name: str(f, "name"), weeklyTargetMin: optNum(f, "weeklyTargetMin") ?? 120 }).run();
  done();
}

export async function deleteHobby(f: FormData) {
  db().delete(s.hobbies).where(eq(s.hobbies.id, str(f, "id"))).run();
  done();
}

export async function logHobbySession(f: FormData) {
  const d = db();
  const h = d.select().from(s.hobbies).where(eq(s.hobbies.id, str(f, "hobbyId"))).get();
  if (!h) return;
  applyQuickLog(d, { type: "hobby", hobbyName: h.name, minutes: optNum(f, "minutes") ?? 30 }, str(f, "date") || today());
  done();
}

export async function addMilestone(f: FormData) {
  db().insert(s.milestones).values({ hobbyId: str(f, "hobbyId"), title: str(f, "title"), dueDate: optStr(f, "dueDate") }).run();
  done();
}

export async function toggleMilestone(id: string) {
  const d = db();
  const m = d.select().from(s.milestones).where(eq(s.milestones.id, id)).get();
  if (!m) return;
  d.update(s.milestones).set({ done: !m.done }).where(eq(s.milestones.id, id)).run();
  if (!m.done) addLog(d, { domain: "life", kind: "milestone", summary: `Milestone reached: ${m.title}`, refTable: "milestones", refId: id });
  done();
}

// ---------- Goals ----------
export async function createGoal(f: FormData) {
  db()
    .insert(s.goals)
    .values({ title: str(f, "title"), domain: str(f, "domain") as "work", metric: optStr(f, "metric"), target: optNum(f, "target"), deadline: optStr(f, "deadline") })
    .run();
  done();
}

export async function setGoalStatus(f: FormData) {
  db().update(s.goals).set({ status: str(f, "status") as "done" }).where(eq(s.goals.id, str(f, "id"))).run();
  done();
}

// ---------- Weekly review ----------
export async function generateWeeklyReview(f: FormData) {
  const ws = str(f, "weekStart") || weekStart(today());
  const d = db();
  const { weeklyScores } = await import("@/lib/data");
  const scores = weeklyScores(d, ws);
  let summary: string;
  try {
    summary = await weeklySummary(d, ws);
  } catch (e) {
    summary = `Guru is unavailable right now (${e instanceof Error ? e.message : "error"}).`;
  }
  d.insert(s.weeklyReviews)
    .values({ weekStart: ws, scores, guruSummary: summary })
    .onConflictDoUpdate({ target: s.weeklyReviews.weekStart, set: { scores, guruSummary: summary } })
    .run();
  done();
}

export async function saveWeeklyReview(f: FormData) {
  const ws = str(f, "weekStart");
  const commitments = [str(f, "c1"), str(f, "c2"), str(f, "c3")].filter(Boolean);
  const d = db();
  d.insert(s.weeklyReviews)
    .values({ weekStart: ws, wins: optStr(f, "wins"), misses: optStr(f, "misses"), commitments })
    .onConflictDoUpdate({ target: s.weeklyReviews.weekStart, set: { wins: optStr(f, "wins"), misses: optStr(f, "misses"), commitments } })
    .run();
  // Commitments become next week's pinned goals.
  const next = new Date(`${ws}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 7);
  const nextWs = next.toISOString().slice(0, 10);
  d.delete(s.goals).where(and(eq(s.goals.pinnedWeek, nextWs), eq(s.goals.status, "active"))).run();
  for (const c of commitments) d.insert(s.goals).values({ title: c, domain: "routine", pinnedWeek: nextWs, deadline: new Date(next.getTime() + 6 * 86_400_000).toISOString().slice(0, 10) }).run();
  done();
}

// ---------- Journal ----------
export async function addJournal(f: FormData) {
  applyQuickLog(db(), { type: "journal", text: str(f, "text") }, today());
  done();
}
