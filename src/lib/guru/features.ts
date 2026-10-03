import { and, asc, desc, eq, like } from "drizzle-orm";
import { z } from "zod";
import { type DB, schema as s } from "../db";
import { aiEnabled, generate, generateObject, FAST_MODEL } from "./client";
import { buildContext } from "./context";
import { parseQuickLog, QuickLogSchema, type QuickLog, type QuickLogContext } from "../quicklog";
import { calendarFor, peopleWithStatus, sleepFor, sprintFor, weeklyScores, lifeMinutesInWeek, LIFE_WEEKLY_TARGET_MIN, portfolioSummary } from "../data";
import { addDays, nowHHMM } from "../time";
import { pct } from "../format";
import { COMMS_TEMPLATES, type CommsKind } from "../comms";

// ---------- Daily briefing ----------
export function latestBriefing(db: DB, date: string) {
  return db
    .select()
    .from(s.guruRuns)
    .where(eq(s.guruRuns.kind, `briefing:${date}`))
    .orderBy(desc(s.guruRuns.createdAt))
    .get();
}

/** Rule-based briefing so the Guru line works with no API key. */
export function offlineBriefing(db: DB, date: string): string {
  const bits: string[] = [];
  const sleep = sleepFor(db, date);
  if (sleep?.minutes) bits.push(`Slept ${Math.floor(sleep.minutes / 60)}h${String(sleep.minutes % 60).padStart(2, "0")}.`);
  const events = calendarFor(db, date).filter((e) => !e.allDay);
  const beforeNoon = events.filter((e) => e.startAt.slice(11, 13) < "12").length;
  if (events.length) bits.push(`${events.length} meeting${events.length > 1 ? "s" : ""} today${beforeNoon ? `, ${beforeNoon} before noon` : ""}.`);
  const sprint = sprintFor(db, date);
  const open = sprint.filter((t) => t.status !== "done");
  if (!sprint.length) bits.push("Pick today's top 3.");
  else if (open.length) bits.push(`First up: ${open[0].title}.`);
  else bits.push("All top tasks done. Nice.");
  const due = peopleWithStatus(db, date).find((p) => p.due);
  if (due) bits.push(due.daysSince === null ? `Reach out to ${due.name} today.` : `Call ${due.name}, it has been ${due.daysSince} days.`);
  const p = portfolioSummary(db);
  if (p.holdings.length && Math.abs(p.dayChangePct) >= 0.02) bits.push(`Portfolio ${pct(p.dayChangePct)} today.`);
  return bits.join(" ") || "A fresh day. Start with your morning routine.";
}

export async function runBriefing(db: DB, date: string): Promise<string> {
  if (!aiEnabled()) {
    const text = offlineBriefing(db, date);
    db.insert(s.guruRuns).values({ kind: `briefing:${date}`, output: text, model: "offline" }).run();
    return text;
  }
  const ctx = buildContext(db, date);
  const { text } = await generate(
    db,
    `briefing:${date}`,
    `Write today's briefing. First line: one headline sentence of at most 40 words covering sleep, meetings, the first task, and anyone due a call.
Then a blank line, then 3 to 6 short bullet points ("- ") with the most useful specifics for today, in time order. Nothing else.`,
    ctx,
    { maxTokens: 1500 },
  );
  return text;
}

// ---------- Task decomposition ----------
const StepsSchema = z.object({
  steps: z.array(z.object({ title: z.string(), estimateMin: z.number() })),
});

export async function decomposeTask(db: DB, taskId: string) {
  const task = db.select().from(s.tasks).where(eq(s.tasks.id, taskId)).get();
  if (!task) throw new Error("Task not found");
  const project = task.projectId ? db.select().from(s.projects).where(eq(s.projects.id, task.projectId)).get() : null;
  let steps: { title: string; estimateMin: number }[];
  if (aiEnabled()) {
    const out = await generateObject(
      db,
      "decompose",
      `Break this task into 3 to 8 concrete steps, each under 60 minutes, in the order to do them. Each title starts with a verb.
Task: ${task.title}${task.notes ? `\nNotes: ${task.notes}` : ""}`,
      project ? `Project: ${project.name}${project.description ? ` - ${project.description}` : ""}` : "No project.",
      StepsSchema,
      { model: process.env.GURU_MODEL ?? undefined },
    );
    steps = out.steps;
  } else {
    steps = [
      { title: `Define what "done" looks like for: ${task.title}`, estimateMin: 15 },
      { title: "List the inputs, people and files you need", estimateMin: 15 },
      { title: "Do the first rough pass", estimateMin: 45 },
      { title: "Review and fix the gaps", estimateMin: 30 },
      { title: "Share it or mark it done", estimateMin: 10 },
    ];
  }
  const existing = db.select().from(s.tasks).where(eq(s.tasks.parentId, taskId)).all().length;
  db.insert(s.tasks)
    .values(
      steps.map((st, i) => ({
        projectId: task.projectId,
        parentId: taskId,
        title: st.title,
        estimateMin: Math.min(60, Math.max(5, Math.round(st.estimateMin))),
        sort: existing + i,
      })),
    )
    .run();
  return steps;
}

// ---------- Communication drafts ----------
export function offlineCommsDraft(kind: CommsKind, title: string, fields: Record<string, string>): string {
  const t = COMMS_TEMPLATES[kind];
  const out = [title, ""];
  for (const f of t.fields) {
    const v = fields[f.key]?.trim();
    out.push(`${f.label}:`, v ? v : "(fill in)", "");
  }
  return out.join("\n").trim();
}

export async function draftComms(db: DB, docId: string): Promise<string> {
  const doc = db.select().from(s.commsDocs).where(eq(s.commsDocs.id, docId)).get();
  if (!doc) throw new Error("Doc not found");
  const t = COMMS_TEMPLATES[doc.kind];
  let draft: string;
  if (!aiEnabled()) {
    draft = offlineCommsDraft(doc.kind, doc.title, doc.fields);
  } else {
    const tasks = doc.projectId
      ? db.select().from(s.tasks).where(eq(s.tasks.projectId, doc.projectId)).orderBy(asc(s.tasks.sort)).all()
      : [];
    const ctx = [
      `Document type: ${t.name}. Sections: ${t.fields.map((f) => f.label).join("; ")}.`,
      `Title: ${doc.title}`,
      ...t.fields.map((f) => `${f.label}: ${doc.fields[f.key] || "(not given)"}`),
      tasks.length ? `Linked project tasks:\n${tasks.map((x) => `- [${x.status}] ${x.title}`).join("\n")}` : "",
    ].join("\n");
    ({ text: draft } = await generate(db, `comms:${doc.kind}`, t.prompt, ctx, { maxTokens: 3000 }));
  }
  db.update(s.commsDocs).set({ draft }).where(eq(s.commsDocs.id, docId)).run();
  return draft;
}

// ---------- Weekly review ----------
export async function weeklySummary(db: DB, ws: string): Promise<string> {
  const scores = weeklyScores(db, ws);
  const we = addDays(ws, 6);
  const logs = db
    .select()
    .from(s.logEntries)
    .where(and(like(s.logEntries.date, `${ws.slice(0, 4)}%`)))
    .all()
    .filter((l) => l.date >= ws && l.date <= we);
  const ctx = [
    `Week ${ws} to ${we}. Scores (0-100): ${Object.entries(scores).map(([k, v]) => `${k} ${v}`).join(", ")}.`,
    `Quality time: ${lifeMinutesInWeek(db, we)} of ${LIFE_WEEKLY_TARGET_MIN} minutes.`,
    `Log (${logs.length} entries):`,
    ...logs.slice(-150).map((l) => `- ${l.date} ${l.at} [${l.domain}] ${l.summary}`),
  ].join("\n");
  if (!aiEnabled()) {
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    return `Strongest: ${sorted[0][0]} (${sorted[0][1]}). Weakest: ${sorted[sorted.length - 1][0]} (${sorted[sorted.length - 1][1]}). Next week, put one small daily action on ${sorted[sorted.length - 1][0]} and protect it in your calendar.`;
  }
  const { text } = await generate(
    db,
    "weekly_review",
    `Write my weekly review. Format exactly:
Wins: 3 bullets.
Misses: 3 bullets.
One change for next week: one sentence, specific and small.
Base everything on the log and scores; do not invent events.`,
    ctx,
    { maxTokens: 2000 },
  );
  return text;
}

// ---------- Quick log parsing ----------
export async function parseLog(db: DB, text: string, ctx: QuickLogContext): Promise<QuickLog> {
  if (!aiEnabled()) return parseQuickLog(text, ctx);
  try {
    const out = await generateObject(
      db,
      "quick_log",
      `Classify and parse this quick log entry into exactly one record: "${text}"
Rules: amounts are in the user's currency; times as HH:MM 24h; minutes as numbers; use null when unknown.
Use "journal" only if nothing else fits.`,
      `Now: ${ctx.nowHHMM}. Known people: ${ctx.people.join(", ") || "none"}. Hobbies: ${ctx.hobbies.join(", ") || "none"}. Expense categories: ${ctx.categories.join(", ")}.`,
      z.object({ entry: QuickLogSchema }),
      { model: FAST_MODEL, maxTokens: 1000 },
    );
    return out.entry;
  } catch (err) {
    console.error("AI quick-log parse failed, using rules", err);
    return parseQuickLog(text, ctx);
  }
}

export { nowHHMM };
