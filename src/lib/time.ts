// All "what day is it" logic goes through the user's timezone, not the server's (Cloud Run is UTC).
export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "Asia/Kolkata";

function parts(d: Date, tz = APP_TIMEZONE) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return p as Record<string, string>;
}

/** YYYY-MM-DD in the app timezone. */
export function today(now = new Date(), tz = APP_TIMEZONE): string {
  const p = parts(now, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** HH:MM in the app timezone. */
export function nowHHMM(now = new Date(), tz = APP_TIMEZONE): string {
  const p = parts(now, tz);
  return `${p.hour}:${p.minute}`;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
/** ISO weekday (1 = Monday) in the app timezone. */
export function isoWeekday(now = new Date(), tz = APP_TIMEZONE): number {
  return WEEKDAYS[parts(now, tz).weekday];
}

export function weekdayOf(date: string): number {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** Monday of the week containing date. */
export function weekStart(date: string): string {
  return addDays(date, 1 - weekdayOf(date));
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** True when hhmm falls in [start, end), handling blocks that cross midnight. */
export function inRange(hhmm: string, start: string, end: string): boolean {
  const t = toMinutes(hhmm);
  const s = toMinutes(start);
  const e = toMinutes(end);
  return s <= e ? t >= s && t < e : t >= s || t < e;
}

export function minutesBetweenTimes(start: string, end: string): number {
  const d = toMinutes(end) - toMinutes(start);
  return d < 0 ? d + 1440 : d;
}

export function formatDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
