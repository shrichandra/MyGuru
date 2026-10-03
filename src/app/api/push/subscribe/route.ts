import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/lib/db";

const Sub = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) });

export async function POST(req: Request) {
  const body = Sub.safeParse(await req.json());
  if (!body.success) return Response.json({ error: "bad subscription" }, { status: 400 });
  const { endpoint, keys } = body.data;
  getDb()
    .insert(s.pushSubscriptions)
    .values({ endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({ target: s.pushSubscriptions.endpoint, set: { p256dh: keys.p256dh, auth: keys.auth } })
    .run();
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { endpoint } = (await req.json()) as { endpoint?: string };
  if (endpoint) getDb().delete(s.pushSubscriptions).where(eq(s.pushSubscriptions.endpoint, endpoint)).run();
  return Response.json({ ok: true });
}
