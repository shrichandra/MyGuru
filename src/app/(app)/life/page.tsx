import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/lib/db";
import { lifeMinutesInWeek, LIFE_WEEKLY_TARGET_MIN, peopleWithStatus } from "@/lib/data";
import { formatDate, today, weekStart } from "@/lib/time";
import { mins } from "@/lib/format";
import { Details, Empty, Field, PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ActionButton } from "@/components/ActionButton";
import { addMilestone, createHobby, createPerson, deleteHobby, deletePerson, logHobbySession, logTouchpoint, toggleMilestone } from "@/app/actions";
import { CheckIcon } from "@/components/Icons";

export default async function Life() {
  const db = getDb();
  const date = today();
  const ws = weekStart(date);
  const people = peopleWithStatus(db, date);
  const hobbies = db.select().from(s.hobbies).orderBy(asc(s.hobbies.name)).all();
  const hobbyWeek = db
    .select({ hobbyId: s.hobbySessions.hobbyId, m: sql<number>`sum(${s.hobbySessions.minutes})` })
    .from(s.hobbySessions)
    .where(gte(s.hobbySessions.date, ws))
    .groupBy(s.hobbySessions.hobbyId)
    .all();
  const hobbyMin = new Map(hobbyWeek.map((h) => [h.hobbyId, h.m]));
  const milestones = db.select().from(s.milestones).orderBy(asc(s.milestones.done), asc(s.milestones.dueDate)).all();
  const recent = db
    .select({ t: s.touchpoints, name: s.people.name })
    .from(s.touchpoints)
    .innerJoin(s.people, eq(s.touchpoints.personId, s.people.id))
    .where(and(gte(s.touchpoints.date, ws)))
    .orderBy(desc(s.touchpoints.date))
    .limit(10)
    .all();
  const lifeMin = lifeMinutesInWeek(db, date);

  return (
    <>
      <PageHeader eyebrow={`Week of ${formatDate(ws)}`} title="Life" />
      <section className="card flex flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between">
          <span className="lbl">Quality time this week</span>
          <span className="num text-lg font-semibold">
            {mins(lifeMin)} <span className="text-sm text-muted">/ {mins(LIFE_WEEKLY_TARGET_MIN)}</span>
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-soft">
          <div className="h-full rounded bg-life" style={{ width: `${Math.min(100, (lifeMin / LIFE_WEEKLY_TARGET_MIN) * 100)}%` }} />
        </div>
      </section>

      <Section title="People">
        <div className="card flex flex-col">
          {people.length === 0 && <Empty>Add the people you want to stay close to, and how often.</Empty>}
          {people.map((p) => (
            <details key={p.id} className="border-b border-soft last:border-0">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2">
                <span className="flex flex-1 flex-col">
                  <span className="text-sm font-semibold">{p.name}</span>
                  <span className="text-xs text-muted">
                    {p.relation ? `${p.relation} · ` : ""}every {p.contactEveryDays} days
                  </span>
                </span>
                <span className={`chip ${p.due ? "bg-warn-soft text-warn" : "bg-soft text-muted"}`}>
                  {p.daysSince === null ? "no contact yet" : p.daysSince === 0 ? "today" : `${p.daysSince} days`}
                </span>
              </summary>
              <div className="flex flex-wrap items-end gap-2 px-4 pb-3">
                <form action={logTouchpoint} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="personId" value={p.id} />
                  <select name="kind" className="input w-36" aria-label="Kind">
                    <option value="call">Call</option>
                    <option value="meet">Met</option>
                    <option value="message">Message</option>
                    <option value="quality_time">Quality time</option>
                  </select>
                  <input name="minutes" type="number" min={0} placeholder="min" className="input w-20" aria-label="Minutes" />
                  <SubmitButton className="btn-ghost">Log</SubmitButton>
                </form>
                <form action={deletePerson}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="btn-sm text-faint">Remove</button>
                </form>
              </div>
            </details>
          ))}
        </div>
        <Details summary="Add a person">
          <form action={createPerson} className="grid grid-cols-2 gap-2">
            <input name="name" className="input" placeholder="Name" required aria-label="Name" />
            <input name="relation" className="input" placeholder="Mom, friend, mentor" aria-label="Relation" />
            <Field label="Contact every (days)">
              <input name="contactEveryDays" type="number" min={1} defaultValue={14} className="input" />
            </Field>
            <Field label="Birthday">
              <input name="birthday" type="date" className="input" />
            </Field>
            <SubmitButton className="btn-primary col-span-2">Add</SubmitButton>
          </form>
        </Details>
        {recent.length > 0 && (
          <ul className="flex flex-col gap-1 px-1 text-sm text-muted">
            {recent.map((r) => (
              <li key={r.t.id}>
                {formatDate(r.t.date).slice(0, 6)} · {r.t.kind.replace("_", " ")} with {r.name}
                {r.t.minutes ? `, ${r.t.minutes} min` : ""}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Hobbies and side projects">
        <div className="card flex flex-col">
          {hobbies.length === 0 && <Empty>Add a hobby with a weekly time target.</Empty>}
          {hobbies.map((h) => {
            const m = hobbyMin.get(h.id) ?? 0;
            const ms = milestones.filter((x) => x.hobbyId === h.id);
            return (
              <details key={h.id} className="border-b border-soft last:border-0">
                <summary className="flex min-h-12 cursor-pointer list-none flex-col justify-center gap-1 px-4 py-2">
                  <span className="flex justify-between text-sm">
                    <span className="font-semibold">{h.name}</span>
                    <span className="text-muted">
                      {mins(m)} / {mins(h.weeklyTargetMin)}
                    </span>
                  </span>
                  <span className="h-1.5 overflow-hidden rounded bg-soft">
                    <span className="block h-full rounded bg-life" style={{ width: `${Math.min(100, (m / h.weeklyTargetMin) * 100)}%` }} />
                  </span>
                </summary>
                <div className="flex flex-col gap-3 px-4 pb-3">
                  <form action={logHobbySession} className="flex items-end gap-2">
                    <input type="hidden" name="hobbyId" value={h.id} />
                    <input name="minutes" type="number" min={1} defaultValue={30} className="input w-24" aria-label="Minutes" />
                    <SubmitButton className="btn-ghost">Log session</SubmitButton>
                  </form>
                  <ul className="flex flex-col">
                    {ms.map((x) => (
                      <li key={x.id}>
                        <ActionButton action={toggleMilestone.bind(null, x.id)} className={`flex min-h-9 w-full cursor-pointer items-center gap-2 text-left text-sm ${x.done ? "text-muted line-through" : ""}`}>
                          <span className={`flex h-5 w-5 items-center justify-center rounded border-2 ${x.done ? "border-teal bg-teal text-white" : "border-[#B8C0CC]"}`}>{x.done && <CheckIcon size={12} />}</span>
                          {x.title}
                          {x.dueDate && <span className="ml-auto text-xs text-muted">{x.dueDate}</span>}
                        </ActionButton>
                      </li>
                    ))}
                  </ul>
                  <form action={addMilestone} className="flex gap-2">
                    <input type="hidden" name="hobbyId" value={h.id} />
                    <input name="title" className="input" placeholder="Next milestone" required aria-label="Milestone" />
                    <input name="dueDate" type="date" className="input w-40" aria-label="Due date" />
                    <SubmitButton className="btn-ghost">Add</SubmitButton>
                  </form>
                  <form action={deleteHobby}>
                    <input type="hidden" name="id" value={h.id} />
                    <button className="btn-sm text-faint">Remove hobby</button>
                  </form>
                </div>
              </details>
            );
          })}
        </div>
        <form action={createHobby} className="flex gap-2">
          <input name="name" className="input" placeholder="Guitar, writing, side project" required aria-label="Hobby" />
          <input name="weeklyTargetMin" type="number" min={10} defaultValue={120} className="input w-24" aria-label="Weekly minutes target" />
          <SubmitButton className="btn-ghost">Add</SubmitButton>
        </form>
      </Section>
    </>
  );
}
