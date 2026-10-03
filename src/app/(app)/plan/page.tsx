import Link from "next/link";
import { eq, gte } from "drizzle-orm";
import { getDb, schema as s } from "@/lib/db";
import { activeGoals, calendarFor, getTimeBlocks, routinesForDate, routineStreak, sprintFor } from "@/lib/data";
import { addDays, formatDate, inRange, today, weekStart } from "@/lib/time";
import { Details, Empty, Field, PageHeader, Row, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ActionButton } from "@/components/ActionButton";
import { createGoal, createHabit, createRoutine, deleteHabit, logSleep, runCalendarSync, setGoalStatus, toggleHabit, updateTimeBlock } from "@/app/actions";
import { calendarConnected } from "@/lib/calendar/google";
import { CheckIcon } from "@/components/Icons";

export default async function Plan() {
  const db = getDb();
  const date = today();
  const blocks = getTimeBlocks(db);
  const events = calendarFor(db, date);
  const routines = routinesForDate(db, date);
  const allRoutines = db.select().from(s.routines).all();
  const sprint = sprintFor(db, date);
  const goals = activeGoals(db);
  const ws = weekStart(date);
  const habits = db.select().from(s.habits).where(eq(s.habits.active, true)).all();
  const checks = db.select().from(s.habitCheckins).where(gte(s.habitCheckins.date, ws)).all();
  const connected = calendarConnected(db);

  return (
    <>
      <PageHeader eyebrow={formatDate(date)} title="Plan your day" />

      <Section
        title="Day timeline"
        action={connected ? <ActionButton action={runCalendarSync} className="btn-sm bg-soft text-ink" pendingText="Syncing…">Sync calendar</ActionButton> : <Link href="/settings" className="text-xs font-semibold">Connect calendar</Link>}
      >
        <div className="card flex flex-col">
          {blocks.map((b) => {
            const inBlock = events.filter((e) => !e.allDay && inRange(e.startAt.slice(11, 16), b.start, b.end));
            const rs = routines.filter((r) => (b.kind === "morning" && r.kind === "morning") || (b.kind === "wind_down" && r.kind === "evening"));
            return (
              <div key={b.id} className="border-b border-soft px-4 py-3 last:border-0">
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">{b.name}</span>
                  <span className="num text-sm text-muted">
                    {b.start}–{b.end}
                  </span>
                </div>
                <ul className="mt-1 flex flex-col gap-1 text-sm">
                  {rs.map((r) => (
                    <li key={r.id}>
                      <Link href={`/plan/routines/${r.id}`}>
                        {r.name} · {r.doneCount}/{r.steps.length}
                      </Link>
                    </li>
                  ))}
                  {inBlock.map((e) => (
                    <li key={e.id} className="flex gap-2">
                      <span className="num w-11 text-muted">{e.startAt.slice(11, 16)}</span>
                      {e.title}
                    </li>
                  ))}
                  {b.kind === "deep_work" &&
                    sprint.map((t) => (
                      <li key={t.id} className={t.status === "done" ? "text-muted line-through" : ""}>
                        Top 3: {t.title}
                      </li>
                    ))}
                </ul>
              </div>
            );
          })}
          {events.filter((e) => e.allDay).map((e) => (
            <Row key={e.id}>
              <span className="chip bg-soft text-muted">all day</span>
              {e.title}
            </Row>
          ))}
        </div>
        <Details summary="Edit time blocks">
          <div className="flex flex-col gap-3">
            {blocks.map((b) => (
              <form key={b.id} action={updateTimeBlock} className="grid grid-cols-[1fr_88px_88px_auto] items-end gap-2">
                <input type="hidden" name="id" value={b.id} />
                <Field label="Name">
                  <input name="name" defaultValue={b.name} className="input" required />
                </Field>
                <Field label="Start">
                  <input name="start" type="time" defaultValue={b.start} className="input px-2" required />
                </Field>
                <Field label="End">
                  <input name="end" type="time" defaultValue={b.end} className="input px-2" required />
                </Field>
                <SubmitButton className="btn-ghost">Save</SubmitButton>
              </form>
            ))}
          </div>
        </Details>
      </Section>

      <Section title="Routines">
        <div className="card flex flex-col">
          {allRoutines.map((r) => (
            <Row key={r.id} href={`/plan/routines/${r.id}`}>
              <span className="flex-1 text-sm font-semibold">{r.name}</span>
              <span className="text-xs text-muted">{routineStreak(db, r.id, date)}-day streak</span>
            </Row>
          ))}
        </div>
        <Details summary="New routine">
          <form action={createRoutine} className="flex flex-col gap-3">
            <Field label="Name">
              <input name="name" className="input" required placeholder="Gym prep" />
            </Field>
            <Field label="Type">
              <select name="kind" className="input">
                <option value="custom">Custom</option>
                <option value="morning">Morning (shows on Today in the morning)</option>
                <option value="evening">Evening (shows at wind-down)</option>
              </select>
            </Field>
            <SubmitButton>Create</SubmitButton>
          </form>
        </Details>
      </Section>

      <Section title="Sleep">
        <form action={logSleep} className="card grid grid-cols-2 items-end gap-3 p-4 sm:grid-cols-5">
          <Field label="Night ending">
            <input name="date" type="date" defaultValue={date} className="input px-2" />
          </Field>
          <Field label="Bed time">
            <input name="bedTime" type="time" className="input px-2" required />
          </Field>
          <Field label="Wake time">
            <input name="wakeTime" type="time" className="input px-2" required />
          </Field>
          <Field label="Quality 1-5">
            <input name="quality" type="number" min={1} max={5} className="input" />
          </Field>
          <SubmitButton>Log sleep</SubmitButton>
        </form>
      </Section>

      <Section title="Habits this week">
        <div className="card flex flex-col">
          {habits.length === 0 && <Empty>No habits yet. Add one below.</Empty>}
          {habits.map((h) => {
            const mine = checks.filter((c) => c.habitId === h.id);
            return (
              <div key={h.id} className="flex items-center gap-2 border-b border-soft px-4 py-2 last:border-0">
                <span className="flex-1 text-sm">
                  {h.name} <span className="text-xs text-muted">{mine.length}/{h.targetPerWeek}</span>
                </span>
                {Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map((d) => {
                  const on = mine.some((c) => c.date === d);
                  return (
                    <ActionButton
                      key={d}
                      action={toggleHabit.bind(null, h.id, d)}
                      className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[10px] font-semibold ${on ? "bg-teal text-white" : d > date ? "bg-ground text-faint" : "bg-soft text-muted"}`}
                    >
                      {on ? <CheckIcon size={14} /> : formatDate(d).slice(0, 2)}
                    </ActionButton>
                  );
                })}
                <form action={deleteHabit}>
                  <input type="hidden" name="id" value={h.id} />
                  <button className="btn-sm text-faint" aria-label={`Delete ${h.name}`}>×</button>
                </form>
              </div>
            );
          })}
        </div>
        <form action={createHabit} className="flex gap-2">
          <input name="name" className="input" placeholder="New habit, e.g. No sugar" required />
          <input name="targetPerWeek" type="number" min={1} max={7} defaultValue={7} className="input w-20" aria-label="Times per week" />
          <SubmitButton className="btn-ghost">Add</SubmitButton>
        </form>
      </Section>

      <Section title="Goals">
        <div className="card flex flex-col">
          {goals.length === 0 && <Empty>No active goals.</Empty>}
          {goals.map((g) => (
            <div key={g.id} className="flex items-center gap-3 border-b border-soft px-4 py-2 last:border-0">
              <span className="chip bg-soft text-muted">{g.domain}</span>
              <span className="flex-1 text-sm">
                {g.title}
                {g.pinnedWeek ? <span className="ml-2 text-xs text-teal">pinned this week</span> : null}
                {g.deadline ? <span className="ml-2 text-xs text-muted">by {g.deadline}</span> : null}
              </span>
              <form action={setGoalStatus}>
                <input type="hidden" name="id" value={g.id} />
                <input type="hidden" name="status" value="done" />
                <button className="btn-sm bg-teal-soft text-teal">Done</button>
              </form>
            </div>
          ))}
        </div>
        <Details summary="New goal">
          <form action={createGoal} className="grid gap-3 sm:grid-cols-2">
            <Field label="Goal" className="sm:col-span-2">
              <input name="title" className="input" required placeholder="Run a sub-25 5k" />
            </Field>
            <Field label="Domain">
              <select name="domain" className="input">
                {["routine", "health", "wealth", "work", "life"].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="Deadline">
              <input name="deadline" type="date" className="input" />
            </Field>
            <SubmitButton>Add goal</SubmitButton>
          </form>
        </Details>
      </Section>
    </>
  );
}
