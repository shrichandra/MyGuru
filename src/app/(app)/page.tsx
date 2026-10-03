import Link from "next/link";
import { getDb } from "@/lib/db";
import {
  calendarFor,
  currentBlock,
  peopleWithStatus,
  plannedWorkout,
  pulse,
  routinesForDate,
  routineStreak,
  sprintFor,
  workoutsFor,
  getTimeBlocks,
  alertsFiredOn,
  metricFor,
  STEP_TARGET,
} from "@/lib/data";
import { latestBriefing, offlineBriefing } from "@/lib/guru/features";
import { formatDate, nowHHMM, today, toMinutes } from "@/lib/time";
import { Ring } from "@/components/Ring";
import { RoutineChecklist } from "@/components/RoutineChecklist";
import { TaskRow } from "@/components/TaskRow";
import { ActionButton } from "@/components/ActionButton";
import { FlameIcon, PhoneIcon, SettingsIcon, SparkIcon } from "@/components/Icons";
import { Row, Section } from "@/components/ui";
import { refreshBriefing } from "@/app/actions";
import { pct, mins } from "@/lib/format";

function greeting(hhmm: string) {
  const h = Number(hhmm.slice(0, 2));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function Today() {
  const db = getDb();
  const date = today();
  const hhmm = nowHHMM();
  const block = currentBlock(db, hhmm);
  const blocks = getTimeBlocks(db);
  const briefing = latestBriefing(db, date);
  const briefText = briefing?.output ?? offlineBriefing(db, date);
  const [headline, ...rest] = briefText.split("\n");
  const routines = routinesForDate(db, date);
  const sprint = sprintFor(db, date);
  const events = calendarFor(db, date);
  const people = peopleWithStatus(db, date);
  const p = pulse(db, date);
  const plan = plannedWorkout(db, date);
  const worked = workoutsFor(db, date).length > 0;
  const fired = alertsFiredOn(db, date);
  const steps = metricFor(db, date, "steps");
  const name = process.env.OWNER_NAME ?? "Shri";

  // Now card: what fills the hero depends on the time block.
  const kind = block?.kind ?? "morning";
  const routineForBlock =
    kind === "morning" ? routines.find((r) => r.kind === "morning") : kind === "wind_down" ? routines.find((r) => r.kind === "evening") : undefined;

  // Next up: next calendar event, next block, and one overdue item. Max 3 rows.
  const nowMin = toMinutes(hhmm);
  const nextEvent = events.find((e) => !e.allDay && toMinutes(e.startAt.slice(11, 16)) >= nowMin);
  const nextBlock = blocks.find((b) => toMinutes(b.start) > nowMin && b.id !== block?.id);
  const duePerson = people.find((x) => x.due);
  const nextUp: { time: string; title: string; tag?: string; tagClass?: string; href: string; icon?: React.ReactNode }[] = [];
  if (nextEvent) nextUp.push({ time: nextEvent.startAt.slice(11, 16), title: nextEvent.title, href: "/plan" });
  if (nextBlock) nextUp.push({ time: nextBlock.start, title: nextBlock.name, href: "/plan" });
  if (fired.length) nextUp.push({ time: "", title: `Portfolio alert: ${fired[0].symbol ?? "portfolio"}`, tag: "Alert", tagClass: "bg-red-50 text-alert", href: "/wealth" });
  else if (duePerson)
    nextUp.push({
      time: "",
      icon: <PhoneIcon size={18} className="text-life" />,
      title: `Call ${duePerson.name}`,
      tag: duePerson.daysSince === null ? "new" : `${duePerson.daysSince} days`,
      tagClass: "bg-warn-soft text-warn",
      href: "/life",
    });
  else if (plan && !worked) nextUp.push({ time: "", title: `Workout: ${plan.title}`, tag: "planned", tagClass: "bg-soft text-muted", href: "/health" });

  const routineRing = routines.length ? p.routine : 0;
  return (
    <>
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="lbl">
            {formatDate(date)} · {block?.name ?? ""}
          </span>
          <h1 className="num text-[26px] font-bold tracking-tight">
            {greeting(hhmm)}, {name}
          </h1>
        </div>
        <Link href="/settings" aria-label="Settings" className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white">
          <SettingsIcon size={20} />
        </Link>
      </header>

      <details className="group rounded-2xl bg-teal-soft px-4 py-3">
        <summary className="flex cursor-pointer list-none items-start gap-2.5">
          <SparkIcon size={20} className="mt-0.5 shrink-0 text-teal" />
          <span className="text-sm leading-snug">
            {headline}{" "}
            {(rest.join("").trim() || true) && <span className="font-semibold text-teal group-open:hidden">Full briefing</span>}
          </span>
        </summary>
        <div className="mt-2 flex flex-col gap-2 pl-7 text-sm">
          {rest.join("\n").trim() ? <div className="whitespace-pre-wrap">{rest.join("\n").trim()}</div> : null}
          <div className="flex items-center gap-2">
            <ActionButton action={refreshBriefing} className="btn-sm bg-white text-teal" pendingText="Thinking…">
              Refresh briefing
            </ActionButton>
            <span className="text-xs text-muted">{briefing ? `${briefing.model === "offline" ? "Rule-based" : "Guru"} · ${briefing.createdAt.slice(11, 16)} UTC` : "Rule-based preview"}</span>
          </div>
        </div>
      </details>

      <section className="card flex flex-col gap-3 p-4" aria-label="Now">
        <div className="flex items-center justify-between">
          <span className="lbl text-teal">
            Now · {block ? `${block.start} – ${block.end}` : hhmm}
          </span>
          {routineForBlock && routineStreak(db, routineForBlock.id, date) > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted">
              <FlameIcon size={14} className="text-move" />
              {routineStreak(db, routineForBlock.id, date)}-day streak
            </span>
          )}
        </div>
        {routineForBlock ? (
          <>
            <Link href={`/plan/routines/${routineForBlock.id}`} className="text-lg font-bold text-ink no-underline">
              {routineForBlock.name}
            </Link>
            <RoutineChecklist routineId={routineForBlock.id} steps={routineForBlock.steps} compact />
          </>
        ) : kind === "deep_work" || kind === "afternoon" ? (
          <>
            <span className="text-lg font-bold">Today&apos;s top 3</span>
            {sprint.length ? (
              <div className="-mx-4">
                {sprint.map((t) => (
                  <TaskRow key={t.id} task={t} inSprint showSprint={false} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">
                Nothing picked yet. <Link href="/work">Pick up to 3 tasks</Link> for today.
              </p>
            )}
            {nextEvent && (
              <p className="text-sm text-muted">
                Next meeting {nextEvent.startAt.slice(11, 16)}: <span className="font-semibold text-ink">{nextEvent.title}</span>{" "}
                <Link href="/work#comms">Prep it</Link>
              </p>
            )}
          </>
        ) : (
          <>
            <span className="text-lg font-bold">Evening and people</span>
            {people.filter((x) => x.due).slice(0, 3).map((x) => (
              <p key={x.id} className="flex items-center justify-between text-sm">
                <span>{x.name}</span>
                <span className="chip bg-warn-soft text-warn">{x.daysSince === null ? "not yet" : `${x.daysSince} days`}</span>
              </p>
            ))}
            <p className="text-sm text-muted">
              Quality time this week: {mins(p.lifeMinutes)} of {mins(p.lifeTarget)}. <Link href="/life">Log time</Link>
            </p>
          </>
        )}
      </section>

      {nextUp.length > 0 && (
        <Section title="Next up">
          <div className="card flex flex-col">
            {nextUp.slice(0, 3).map((n, i) => (
              <Row key={i} href={n.href}>
                <span className="num w-11 text-sm font-semibold">{n.icon ?? n.time}</span>
                <span className="flex-1 text-sm">{n.title}</span>
                {n.tag && <span className={`chip ${n.tagClass}`}>{n.tag}</span>}
              </Row>
            ))}
          </div>
        </Section>
      )}

      <section aria-label="Pulse" className="card grid grid-cols-5 px-2 py-3 text-center">
        <Ring href="/plan" label="Routine" color="var(--color-teal)" value={routineRing} text={`${Math.round(routineRing * 100)}%`} />
        <Ring
          href="/health"
          label="Move"
          color="var(--color-move)"
          value={p.move}
          text={steps !== null ? (steps >= 1000 ? `${(steps / 1000).toFixed(1)}k` : String(steps)) : worked ? "done" : `${Math.round(p.move * 100)}%`}
        />
        <Ring
          href="/wealth"
          label="Wealth"
          color={p.wealthDayPct !== null && p.wealthDayPct < 0 ? "var(--color-alert)" : "var(--color-wealth)"}
          value={p.wealthDayPct === null ? 0 : Math.min(1, 0.5 + p.wealthDayPct * 10)}
          text={p.wealthDayPct === null ? "–" : pct(p.wealthDayPct)}
        />
        <Ring href="/work" label="Work" color="var(--color-work)" value={p.workDone / p.workTotal} text={`${p.workDone}/${p.workTotal}`} />
        <Ring href="/life" label="Life" color="var(--color-life)" value={p.lifeMinutes / p.lifeTarget} text={`${(p.lifeMinutes / 60).toFixed(1)}h`} />
      </section>
      <p className="px-1 text-xs text-faint">Move target {STEP_TARGET.toLocaleString()} steps or one workout. Life target {mins(p.lifeTarget)} a week.</p>
    </>
  );
}
