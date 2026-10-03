import { eq, lt } from "drizzle-orm";
import { type DB, schema as s } from "./db";
import { calendarFor, lifeMinutesInWeek, peopleWithStatus } from "./data";
import { runBriefing, weeklySummary } from "./guru/features";
import { refreshPortfolio } from "./portfolio";
import { syncCalendar, calendarConnected } from "./calendar/google";
import { sendPush } from "./push";
import { addDays, nowHHMM, toMinutes, today, weekStart } from "./time";
import { weeklyScores } from "./data";

// Jobs Cloud Scheduler calls (see deploy/scheduler.sh). Each is safe to run more than once.
export const JOBS = {
  async "morning-briefing"(db: DB) {
    if (calendarConnected(db)) await syncCalendar(db).catch(() => 0);
    const text = await runBriefing(db, today());
    const headline = text.split("\n")[0];
    return { push: await sendPush(db, "Your MyGuru briefing", headline, "/", { force: true }) };
  },

  async "calendar-sync"(db: DB) {
    return { events: calendarConnected(db) ? await syncCalendar(db) : 0 };
  },

  async "portfolio-refresh"(db: DB) {
    const r = await refreshPortfolio(db);
    let push = null;
    if (r.fired.length) push = await sendPush(db, "Portfolio alert", r.fired.join(" · "), "/wealth", { force: true });
    return { ...r, push };
  },

  /** Every 5 minutes: a nudge 10 minutes before each meeting, linking to its prep. */
  async "meeting-reminders"(db: DB) {
    const now = toMinutes(nowHHMM());
    const soon = calendarFor(db, today()).filter((e) => {
      if (e.allDay) return false;
      const start = toMinutes(e.startAt.slice(11, 16));
      return start - now > 5 && start - now <= 10;
    });
    for (const e of soon) {
      const prep = db.select().from(s.commsDocs).where(eq(s.commsDocs.meetingAt, e.startAt)).get();
      await sendPush(db, `In 10 min: ${e.title}`, prep ? "Your prep is ready." : "Open MyGuru to prep.", prep ? `/work/comms/${prep.id}` : "/work");
    }
    return { reminded: soon.length };
  },

  /** 20:00: nudge if no quality time logged today. */
  async "evening-nudge"(db: DB) {
    const date = today();
    const loggedToday = db.select().from(s.touchpoints).where(eq(s.touchpoints.date, date)).all().length > 0;
    if (loggedToday) return { skipped: "already logged" };
    const due = peopleWithStatus(db, date).find((p) => p.due);
    const body = due ? `No quality time logged yet. ${due.name} is due a call.` : `No quality time logged yet today. ${lifeMinutesInWeek(db, date)} min this week.`;
    return { push: await sendPush(db, "Evening check-in", body, "/life") };
  },

  /** Sunday evening: score the week and write the Guru summary. */
  async "weekly-review"(db: DB) {
    const ws = weekStart(today());
    const scores = weeklyScores(db, ws);
    const summary = await weeklySummary(db, ws);
    db.insert(s.weeklyReviews)
      .values({ weekStart: ws, scores, guruSummary: summary })
      .onConflictDoUpdate({ target: s.weeklyReviews.weekStart, set: { scores, guruSummary: summary } })
      .run();
    return { push: await sendPush(db, "Your weekly review is ready", summary.split("\n")[0], "/review", { force: true }) };
  },

  /** Nightly: drop Guru runs older than 180 days; keeps the DB small. */
  async housekeeping(db: DB) {
    const cutoff = `${addDays(today(), -180)}T00:00:00Z`;
    const res = db.delete(s.guruRuns).where(lt(s.guruRuns.createdAt, cutoff)).run();
    return { deleted: res.changes };
  },
} satisfies Record<string, (db: DB) => Promise<unknown>>;

export type JobName = keyof typeof JOBS;
