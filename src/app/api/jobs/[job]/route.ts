import { getDb } from "@/lib/db";
import { bearerOk } from "@/lib/auth";
import { JOBS, type JobName } from "@/lib/jobs";

// Cloud Scheduler: POST /api/jobs/<name> with `Authorization: Bearer $CRON_SECRET`.
export async function POST(req: Request, ctx: { params: Promise<{ job: string }> }) {
  if (!bearerOk(req, process.env.CRON_SECRET)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { job } = await ctx.params;
  if (!(job in JOBS)) return Response.json({ error: `unknown job ${job}` }, { status: 404 });
  try {
    const result = await JOBS[job as JobName](getDb());
    return Response.json({ ok: true, job, result });
  } catch (e) {
    console.error(`job ${job} failed`, e);
    return Response.json({ ok: false, job, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
