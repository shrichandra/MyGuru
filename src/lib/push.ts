import webpush from "web-push";
import { eq } from "drizzle-orm";
import { type DB, schema as s } from "./db";
import { inRange, nowHHMM } from "./time";

export function pushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Quiet hours: from bedtime minus 60 minutes until wake time, no notifications unless forced. */
export function inQuietHours(hhmm = nowHHMM()) {
  const start = process.env.QUIET_START ?? "21:30";
  const end = process.env.QUIET_END ?? "06:00";
  return inRange(hhmm, start, end);
}

export async function sendPush(db: DB, title: string, body: string, url = "/", opts: { force?: boolean } = {}) {
  if (!pushConfigured()) return { sent: 0, skipped: "push not configured" };
  if (!opts.force && inQuietHours()) return { sent: 0, skipped: "quiet hours" };
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:owner@example.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  let sent = 0;
  for (const sub of db.select().from(s.pushSubscriptions).all()) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body, url }),
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) db.delete(s.pushSubscriptions).where(eq(s.pushSubscriptions.id, sub.id)).run();
    }
  }
  return { sent };
}
