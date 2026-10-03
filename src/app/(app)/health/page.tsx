import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema as s } from "@/lib/db";
import { metricFor, plannedWorkout, sleepFor, STEP_TARGET } from "@/lib/data";
import { addDays, formatDate, today, weekdayOf } from "@/lib/time";
import { Details, Empty, Field, PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { addMealPlan, addWorkoutPlan, deleteMeal, deleteMealPlan, deleteWorkout, deleteWorkoutPlan, logMeal, logWorkout } from "@/app/actions";
import { mins } from "@/lib/format";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;

export default async function Health() {
  const db = getDb();
  const date = today();
  const steps = metricFor(db, date, "steps");
  const sleep = sleepFor(db, date);
  const plan = plannedWorkout(db, date);
  const plans = db.select().from(s.workoutPlans).orderBy(asc(s.workoutPlans.dayOfWeek)).all();
  const weekAgo = addDays(date, -6);
  const sessions = db.select().from(s.workoutSessions).where(gte(s.workoutSessions.date, weekAgo)).orderBy(desc(s.workoutSessions.date)).all();
  const sets = sessions.length ? db.select().from(s.exerciseSets).where(inArray(s.exerciseSets.sessionId, sessions.map((x) => x.id))).all() : [];
  const meals = db.select().from(s.meals).where(eq(s.meals.date, date)).orderBy(asc(s.meals.createdAt)).all();
  const mealPlans = db.select().from(s.mealPlans).orderBy(asc(s.mealPlans.dayOfWeek)).all();
  const todaysMealPlan = mealPlans.filter((m) => m.dayOfWeek === weekdayOf(date));
  const stepHistory = db
    .select()
    .from(s.healthMetrics)
    .where(and(eq(s.healthMetrics.kind, "steps"), gte(s.healthMetrics.date, weekAgo)))
    .orderBy(asc(s.healthMetrics.date))
    .all();
  const totals = meals.reduce((a, m) => ({ kcal: a.kcal + (m.calories ?? 0), p: a.p + (m.proteinG ?? 0), c: a.c + (m.carbsG ?? 0), f: a.f + (m.fatG ?? 0) }), { kcal: 0, p: 0, c: 0, f: 0 });
  const maxSteps = Math.max(STEP_TARGET, ...stepHistory.map((x) => x.value));

  return (
    <>
      <PageHeader eyebrow={formatDate(date)} title="Health" />

      <div className="grid grid-cols-3 gap-3">
        <div className="card flex flex-col gap-1 p-3">
          <span className="lbl">Steps</span>
          <span className="num text-2xl font-semibold">{steps?.toLocaleString() ?? "–"}</span>
          <span className="text-xs text-muted">of {STEP_TARGET.toLocaleString()}</span>
        </div>
        <div className="card flex flex-col gap-1 p-3">
          <span className="lbl">Sleep</span>
          <span className="num text-2xl font-semibold">{sleep?.minutes ? mins(sleep.minutes) : "–"}</span>
          <span className="text-xs text-muted">{sleep?.quality ? `quality ${sleep.quality}/5` : sleep?.source === "health_connect" ? "Health Connect" : "last night"}</span>
        </div>
        <div className="card flex flex-col gap-1 p-3">
          <span className="lbl">Food</span>
          <span className="num text-2xl font-semibold">{totals.kcal || "–"}</span>
          <span className="text-xs text-muted">kcal · {totals.p}g protein</span>
        </div>
      </div>

      {stepHistory.length > 0 && (
        <Section title="Steps, last 7 days">
          <div className="card flex h-32 items-end gap-2 p-4" role="img" aria-label="Steps per day for the last 7 days">
            {Array.from({ length: 7 }, (_, i) => addDays(weekAgo, i)).map((d) => {
              const v = stepHistory.find((x) => x.date === d)?.value ?? 0;
              return (
                <div key={d} className="flex flex-1 flex-col items-center gap-1">
                  <div className={`w-full rounded-t ${v >= STEP_TARGET ? "bg-move" : "bg-orange-200"}`} style={{ height: `${(v / maxSteps) * 80}px` }} title={`${d}: ${v}`} />
                  <span className="text-[10px] text-muted">{DAYS[weekdayOf(d) - 1].slice(0, 2)}</span>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Workout">
        <div className="card flex flex-col gap-3 p-4">
          <p className="text-sm">
            <span className="font-semibold">Today&apos;s plan:</span> {plan ? `${plan.title}${plan.details ? ` · ${plan.details}` : ""}` : "Rest day (nothing planned)"}
          </p>
          <form action={logWorkout} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input type="hidden" name="planId" value={plan?.id ?? ""} />
            <Field label="What" className="col-span-2">
              <input name="title" defaultValue={plan?.title ?? ""} className="input" required placeholder="Push day, 5k run" />
            </Field>
            <Field label="Minutes">
              <input name="minutes" type="number" min={1} className="input" />
            </Field>
            <Field label="Distance km">
              <input name="distanceKm" type="number" step="0.1" min={0} className="input" />
            </Field>
            <Field label="Exercise (optional)" className="col-span-2">
              <input name="exercise" className="input" placeholder="Bench press" />
            </Field>
            <Field label="Sets">
              <input name="sets" type="number" min={1} className="input" />
            </Field>
            <Field label="Reps">
              <input name="reps" type="number" min={1} className="input" />
            </Field>
            <Field label="Weight kg">
              <input name="weightKg" type="number" step="0.5" min={0} className="input" />
            </Field>
            <div className="col-span-2 flex items-end sm:col-span-3">
              <SubmitButton className="btn-primary w-full">Log workout</SubmitButton>
            </div>
          </form>
        </div>
        <div className="card flex flex-col">
          {sessions.length === 0 && <Empty>No workouts in the last 7 days.</Empty>}
          {sessions.map((w) => (
            <div key={w.id} className="flex items-start gap-3 border-b border-soft px-4 py-2 last:border-0">
              <span className="num w-14 shrink-0 text-xs text-muted">{formatDate(w.date).slice(0, 6)}</span>
              <span className="flex-1 text-sm">
                <span className="font-semibold">{w.title}</span>
                {w.minutes ? ` · ${w.minutes} min` : ""}
                {w.distanceKm ? ` · ${w.distanceKm} km` : ""}
                {w.source !== "manual" && <span className="ml-2 chip bg-soft text-muted">{w.source}</span>}
                {sets
                  .filter((x) => x.sessionId === w.id)
                  .map((x) => (
                    <span key={x.id} className="block text-xs text-muted">
                      {x.exercise} {x.sets ? `${x.sets}×${x.reps ?? "?"}` : ""} {x.weightKg ? `@ ${x.weightKg}kg` : ""}
                    </span>
                  ))}
              </span>
              <form action={deleteWorkout}>
                <input type="hidden" name="id" value={w.id} />
                <button className="btn-sm text-faint" aria-label="Delete workout">×</button>
              </form>
            </div>
          ))}
        </div>
        <Details summary="Weekly workout plan">
          <ul className="mb-3 flex flex-col gap-1 text-sm">
            {plans.length === 0 && <li className="text-muted">No plan yet.</li>}
            {plans.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className="w-10 font-semibold">{DAYS[p.dayOfWeek - 1]}</span>
                <span className="flex-1">
                  {p.title}
                  {p.details ? <span className="text-muted"> · {p.details}</span> : null}
                </span>
                <form action={deleteWorkoutPlan}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="btn-sm text-faint" aria-label="Delete">×</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addWorkoutPlan} className="grid grid-cols-[90px_1fr] gap-2 sm:grid-cols-[90px_1fr_1fr_auto]">
            <select name="dayOfWeek" className="input" aria-label="Day">
              {DAYS.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </select>
            <input name="title" className="input" placeholder="Legs" required />
            <input name="details" className="input col-span-2 sm:col-span-1" placeholder="Squat 5×5, lunges 3×10" />
            <SubmitButton className="btn-ghost col-span-2 sm:col-span-1">Add</SubmitButton>
          </form>
        </Details>
      </Section>

      <Section title="Meals today">
        {todaysMealPlan.length > 0 && (
          <p className="px-1 text-sm text-muted">
            Plan: {todaysMealPlan.map((m) => `${m.mealType} ${m.description}`).join(" · ")}
          </p>
        )}
        <div className="card flex flex-col">
          {meals.length === 0 && <Empty>No meals logged. Use + Log, e.g. &ldquo;lunch dal rice 2 roti&rdquo;.</Empty>}
          {meals.map((m) => (
            <div key={m.id} className="flex items-center gap-3 border-b border-soft px-4 py-2 last:border-0">
              <span className="chip bg-soft capitalize text-muted">{m.mealType}</span>
              <span className="flex-1 text-sm">{m.description}</span>
              <span className="text-xs text-muted">
                {m.calories ? `${m.calories} kcal` : ""}
                {m.proteinG ? ` · P${m.proteinG}` : ""}
                {m.carbsG ? ` C${m.carbsG}` : ""}
                {m.fatG ? ` F${m.fatG}` : ""}
              </span>
              <form action={deleteMeal}>
                <input type="hidden" name="id" value={m.id} />
                <button className="btn-sm text-faint" aria-label="Delete meal">×</button>
              </form>
            </div>
          ))}
          {meals.length > 0 && (
            <p className="px-4 py-2 text-xs text-muted">
              Total {totals.kcal} kcal · protein {totals.p}g · carbs {totals.c}g · fat {totals.f}g
            </p>
          )}
        </div>
        <Details summary="Add a meal with macros">
          <form action={logMeal} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <select name="mealType" className="input" aria-label="Meal">
              {MEALS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <input name="description" className="input col-span-1 sm:col-span-3" placeholder="Paneer bowl" required />
            <input name="calories" type="number" className="input" placeholder="kcal" aria-label="Calories" />
            <input name="proteinG" type="number" className="input" placeholder="protein g" aria-label="Protein grams" />
            <input name="carbsG" type="number" className="input" placeholder="carbs g" aria-label="Carbs grams" />
            <input name="fatG" type="number" className="input" placeholder="fat g" aria-label="Fat grams" />
            <SubmitButton className="btn-primary col-span-2 sm:col-span-4">Save meal</SubmitButton>
          </form>
        </Details>
        <Details summary="Weekly meal plan">
          <ul className="mb-3 flex flex-col gap-1 text-sm">
            {mealPlans.length === 0 && <li className="text-muted">No meal plan yet.</li>}
            {mealPlans.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <span className="w-10 font-semibold">{DAYS[m.dayOfWeek - 1]}</span>
                <span className="w-20 capitalize text-muted">{m.mealType}</span>
                <span className="flex-1">{m.description}</span>
                <form action={deleteMealPlan}>
                  <input type="hidden" name="id" value={m.id} />
                  <button className="btn-sm text-faint" aria-label="Delete">×</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addMealPlan} className="grid grid-cols-2 gap-2 sm:grid-cols-[90px_120px_1fr_auto]">
            <select name="dayOfWeek" className="input" aria-label="Day">
              {DAYS.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </select>
            <select name="mealType" className="input" aria-label="Meal">
              {MEALS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <input name="description" className="input col-span-2 sm:col-span-1" placeholder="Oats, banana, whey" required />
            <SubmitButton className="btn-ghost col-span-2 sm:col-span-1">Add</SubmitButton>
          </form>
        </Details>
      </Section>
      <p className="px-1 text-xs text-faint">Steps, sleep and workouts arrive automatically once the MyGuru Android app syncs Health Connect (see Settings).</p>
    </>
  );
}
