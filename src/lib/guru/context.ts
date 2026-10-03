import type { DB } from "../db";
import {
  activeGoals,
  alertsFiredOn,
  calendarFor,
  currentBlock,
  metricFor,
  peopleWithStatus,
  plannedWorkout,
  portfolioSummary,
  routineCompletion,
  sleepFor,
  sprintFor,
  workoutsFor,
  lifeMinutesInWeek,
  LIFE_WEEKLY_TARGET_MIN,
} from "../data";
import { addDays, nowHHMM } from "../time";
import { money } from "../format";

/**
 * The compact context bundle every Guru call gets: plain SQL, no vector DB.
 * A few thousand tokens at most, as readable lines.
 */
export function buildContext(db: DB, date: string): string {
  const y = addDays(date, -1);
  const lines: string[] = [];
  const block = currentBlock(db);
  lines.push(`Date: ${date}. Time now: ${nowHHMM()}. Current block: ${block?.name ?? "none"}.`);

  const sleep = sleepFor(db, date);
  if (sleep?.minutes) lines.push(`Sleep last night: ${Math.floor(sleep.minutes / 60)}h${sleep.minutes % 60}m${sleep.quality ? `, quality ${sleep.quality}/5` : ""}.`);
  const stepsY = metricFor(db, y, "steps");
  if (stepsY !== null) lines.push(`Steps yesterday: ${stepsY}.`);
  lines.push(`Routine completion yesterday: ${Math.round(routineCompletion(db, y) * 100)}%.`);

  const events = calendarFor(db, date);
  if (events.length) {
    lines.push("Calendar today:");
    for (const e of events) lines.push(`- ${e.allDay ? "all day" : `${e.startAt.slice(11, 16)}-${e.endAt.slice(11, 16)}`} ${e.title}`);
  } else lines.push("Calendar today: no events synced.");

  const sprint = sprintFor(db, date);
  if (sprint.length) {
    lines.push("Today's top tasks:");
    for (const t of sprint) lines.push(`- [${t.status}] ${t.title}`);
  } else lines.push("Today's top tasks: not picked yet.");

  const plan = plannedWorkout(db, date);
  const done = workoutsFor(db, date);
  if (plan) lines.push(`Planned workout: ${plan.title}${done.length ? " (done)" : ""}.`);

  const p = portfolioSummary(db);
  if (p.holdings.length) {
    lines.push(`Portfolio: value ${money(p.valueCents)}, day change ${money(p.dayChangeCents)} (${(p.dayChangePct * 100).toFixed(2)}%).`);
    const fired = alertsFiredOn(db, date);
    for (const a of fired) lines.push(`- Alert fired: ${a.symbol ?? "portfolio"} ${a.kind} ${a.threshold}`);
  }

  const due = peopleWithStatus(db, date).filter((x) => x.due).slice(0, 3);
  for (const d of due) lines.push(`Person due a touchpoint: ${d.name}${d.relation ? ` (${d.relation})` : ""}, ${d.daysSince === null ? "never logged" : `${d.daysSince} days since last contact`}.`);
  lines.push(`Quality time this week: ${lifeMinutesInWeek(db, date)} of ${LIFE_WEEKLY_TARGET_MIN} minutes.`);

  const goals = activeGoals(db).slice(0, 5);
  if (goals.length) {
    lines.push("Active goals:");
    for (const g of goals) lines.push(`- (${g.domain}) ${g.title}${g.deadline ? ` by ${g.deadline}` : ""}`);
  }
  return lines.join("\n");
}
