import { z } from "zod";

// "+ Log" quick entry: one short sentence becomes one typed record.
export const QuickLogSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("meal"),
    mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
    description: z.string(),
    calories: z.number().nullable(),
  }),
  z.object({
    type: z.literal("workout"),
    title: z.string(),
    minutes: z.number().nullable(),
    distanceKm: z.number().nullable(),
  }),
  z.object({
    type: z.literal("touchpoint"),
    personName: z.string(),
    kind: z.enum(["call", "meet", "message", "quality_time"]),
    minutes: z.number(),
  }),
  z.object({
    type: z.literal("expense"),
    amount: z.number(),
    category: z.string().nullable(),
    note: z.string(),
  }),
  z.object({
    type: z.literal("sleep"),
    bedTime: z.string().nullable(),
    wakeTime: z.string().nullable(),
    minutes: z.number().nullable(),
    quality: z.number().nullable(),
  }),
  z.object({ type: z.literal("hobby"), hobbyName: z.string(), minutes: z.number() }),
  z.object({ type: z.literal("task"), title: z.string() }),
  z.object({ type: z.literal("journal"), text: z.string() }),
]);
export type QuickLog = z.infer<typeof QuickLogSchema>;

export interface QuickLogContext {
  people: string[];
  hobbies: string[];
  categories: string[];
  nowHHMM: string;
}

const num = (s: string | undefined) => (s === undefined ? null : Number(s));

function minutesIn(text: string): number | null {
  const h = text.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i);
  const m = text.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/i);
  if (!h && !m) return null;
  return Math.round((h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0));
}

/** "11pm", "23:15", "6:30am" -> "HH:MM" */
export function parseClock(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function mealTypeFor(hhmm: string): "breakfast" | "lunch" | "dinner" | "snack" {
  const h = Number(hhmm.slice(0, 2));
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h >= 19) return "dinner";
  return "snack";
}

const WORKOUT = /\b(ran|run|running|jog|jogged|walk|walked|gym|lift|lifted|weights|yoga|swim|swam|cycle|cycled|cycling|bike|hiit|workout|pushups|push-ups|squats|trained|tennis|badminton|cricket|football)\b/i;

/** Rule-based parser. Used when no AI key is configured and as a cross-check. */
export function parseQuickLog(input: string, ctx: QuickLogContext): QuickLog {
  const text = input.trim();
  const lower = text.toLowerCase();

  // Tasks: "todo: ...", "task ...", "remind me to ..."
  const task = text.match(/^(?:todo|task|to do|remind me to)[:\s]+(.+)$/i);
  if (task) return { type: "task", title: task[1].trim() };

  // People: "called Ravi 20 min", "met Mom", "texted Priya"
  const person = ctx.people.find((p) => new RegExp(`\\b${escapeRe(p)}\\b`, "i").test(text));
  const touch = lower.match(/\b(call|called|calling|phoned|met|meet|meeting|lunch with|dinner with|coffee with|texted|messaged|message|whatsapp(?:ed)?|played with|time with|quality time)\b/);
  if (touch) {
    const word = touch[1];
    const kind = /call|phoned/.test(word)
      ? "call"
      : /text|messag|whatsapp/.test(word)
        ? "message"
        : /played|time/.test(word)
          ? "quality_time"
          : "meet";
    const name =
      person ??
      text
        .slice(touch.index! + word.length)
        .trim()
        .match(/^([A-Z][\w'-]*(?:\s[A-Z][\w'-]*)?)/)?.[1] ??
      null;
    if (name) return { type: "touchpoint", personName: name, kind, minutes: minutesIn(text) ?? 0 };
  }

  // Sleep: "slept 11pm-6:30am q4", "sleep 7h"
  if (/\b(slept|sleep|bed at|woke)\b/i.test(text)) {
    const range = text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|to|–)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    const quality = text.match(/\bq(?:uality)?\s*([1-5])\b/i);
    return {
      type: "sleep",
      bedTime: range ? parseClock(range[1]) : null,
      wakeTime: range ? parseClock(range[2]) : null,
      minutes: range ? null : minutesIn(text),
      quality: num(quality?.[1]),
    };
  }

  // Expenses: "spent 450 on food", "₹300 uber", "paid 1200 electricity"
  const money = text.match(/(?:₹|rs\.?|inr|\$|spent|paid)\s*(\d+(?:[.,]\d+)?)/i);
  if (money) {
    const amount = Number(money[1].replace(",", ""));
    const category = ctx.categories.find((c) => lower.includes(c.toLowerCase())) ?? guessCategory(lower);
    return { type: "expense", amount, category, note: text };
  }

  // Hobbies: "guitar 30 min"
  const hobby = ctx.hobbies.find((h) => new RegExp(`\\b${escapeRe(h)}\\b`, "i").test(text));
  if (hobby) return { type: "hobby", hobbyName: hobby, minutes: minutesIn(text) ?? 30 };

  // Workouts: "ran 5k 28 min", "gym 45 min"
  if (WORKOUT.test(text)) {
    const km = text.match(/(\d+(?:\.\d+)?)\s*(?:k|km)\b/i);
    return { type: "workout", title: text, minutes: minutesIn(text.replace(/\d+(?:\.\d+)?\s*(?:k|km)\b/i, "")), distanceKm: num(km?.[1]) };
  }

  // Meals: "lunch dal rice 2 roti", "breakfast oats", "ate a banana"
  const meal = lower.match(/^(breakfast|lunch|dinner|snack|ate|had)\b[:\s]*(.*)$/);
  if (meal) {
    const mealType = ["breakfast", "lunch", "dinner", "snack"].includes(meal[1])
      ? (meal[1] as "breakfast" | "lunch" | "dinner" | "snack")
      : mealTypeFor(ctx.nowHHMM);
    const kcal = text.match(/(\d+)\s*(?:kcal|cal|calories)\b/i);
    return { type: "meal", mealType, description: text.slice(meal[1].length).replace(/^[:\s]+/, "") || text, calories: num(kcal?.[1]) };
  }

  return { type: "journal", text };
}

function guessCategory(lower: string): string | null {
  if (/uber|ola|cab|auto|metro|fuel|petrol|bus|train|flight/.test(lower)) return "Transport";
  if (/food|lunch|dinner|swiggy|zomato|grocer|coffee|restaurant/.test(lower)) return "Food";
  if (/rent|electric|water bill|internet|wifi|maid/.test(lower)) return "Home";
  if (/doctor|medicine|pharmacy|gym/.test(lower)) return "Health";
  if (/movie|netflix|game|concert/.test(lower)) return "Fun";
  return null;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function describeQuickLog(q: QuickLog): string {
  switch (q.type) {
    case "meal":
      return `${cap(q.mealType)}: ${q.description}${q.calories ? ` (${q.calories} kcal)` : ""}`;
    case "workout":
      return `Workout: ${q.title}${q.minutes ? `, ${q.minutes} min` : ""}${q.distanceKm ? `, ${q.distanceKm} km` : ""}`;
    case "touchpoint":
      return `${cap(q.kind.replace("_", " "))} with ${q.personName}${q.minutes ? `, ${q.minutes} min` : ""}`;
    case "expense":
      return `Expense ${q.amount}${q.category ? ` in ${q.category}` : ""}`;
    case "sleep":
      return `Sleep${q.bedTime && q.wakeTime ? ` ${q.bedTime} to ${q.wakeTime}` : q.minutes ? ` ${Math.floor(q.minutes / 60)}h${q.minutes % 60}m` : ""}${q.quality ? `, quality ${q.quality}/5` : ""}`;
    case "hobby":
      return `${q.hobbyName}: ${q.minutes} min`;
    case "task":
      return `New task: ${q.title}`;
    case "journal":
      return `Note: ${q.text}`;
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
