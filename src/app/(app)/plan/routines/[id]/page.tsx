import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb, schema as s } from "@/lib/db";
import { routinesForDate, routineStreak } from "@/lib/data";
import { today } from "@/lib/time";
import { Field, PageHeader, Section } from "@/components/ui";
import { RoutineChecklist } from "@/components/RoutineChecklist";
import { SubmitButton } from "@/components/SubmitButton";
import { addRoutineStep, deleteRoutine, deleteRoutineStep, moveRoutineStep, updateRoutine } from "@/app/actions";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function RoutinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const routine = db.select().from(s.routines).where(eq(s.routines.id, id)).get();
  if (!routine) notFound();
  const date = today();
  const todays = routinesForDate(db, date).find((r) => r.id === id);
  const steps = db.select().from(s.routineSteps).where(eq(s.routineSteps.routineId, id)).orderBy(asc(s.routineSteps.sort)).all();
  const total = steps.reduce((n, st) => n + st.minutes, 0);

  return (
    <>
      <PageHeader eyebrow={`${routineStreak(db, id, date)}-day streak · ${total} min`} title={routine.name} />
      {todays ? (
        <section className="card p-4">
          <RoutineChecklist routineId={id} steps={todays.steps} />
        </section>
      ) : (
        <p className="text-sm text-muted">Not scheduled today.</p>
      )}

      <Section title="Steps">
        <div className="card flex flex-col">
          {steps.map((st, i) => (
            <div key={st.id} className="flex items-center gap-2 border-b border-soft px-4 py-2 last:border-0">
              <span className="flex-1 text-sm">{st.title}</span>
              <span className="text-xs text-muted">{st.minutes}m</span>
              <form action={moveRoutineStep}>
                <input type="hidden" name="id" value={st.id} />
                <input type="hidden" name="dir" value="up" />
                <button className="btn-sm text-muted" disabled={i === 0} aria-label="Move up">↑</button>
              </form>
              <form action={moveRoutineStep}>
                <input type="hidden" name="id" value={st.id} />
                <input type="hidden" name="dir" value="down" />
                <button className="btn-sm text-muted" disabled={i === steps.length - 1} aria-label="Move down">↓</button>
              </form>
              <form action={deleteRoutineStep}>
                <input type="hidden" name="id" value={st.id} />
                <button className="btn-sm text-faint" aria-label={`Delete ${st.title}`}>×</button>
              </form>
            </div>
          ))}
        </div>
        <form action={addRoutineStep} className="flex gap-2">
          <input type="hidden" name="routineId" value={id} />
          <input name="title" className="input" placeholder="New step" required />
          <input name="minutes" type="number" min={1} defaultValue={5} className="input w-20" aria-label="Minutes" />
          <SubmitButton className="btn-ghost">Add</SubmitButton>
        </form>
      </Section>

      <Section title="Settings">
        <form action={updateRoutine} className="card flex flex-col gap-3 p-4">
          <input type="hidden" name="id" value={id} />
          <Field label="Name">
            <input name="name" defaultValue={routine.name} className="input" required />
          </Field>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="mb-1 text-xs font-semibold text-muted">Days</legend>
            {DAYS.map((d, i) => (
              <label key={d} className="flex items-center gap-1 rounded-lg bg-soft px-3 py-2 text-sm">
                <input type="checkbox" name="day" value={i + 1} defaultChecked={routine.days.includes(String(i + 1))} />
                {d}
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={routine.active} /> Active
          </label>
          <SubmitButton>Save</SubmitButton>
        </form>
        <form action={deleteRoutine}>
          <input type="hidden" name="id" value={id} />
          <button className="btn-sm text-alert">Delete routine</button>
        </form>
      </Section>
    </>
  );
}
