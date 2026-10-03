import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "@/lib/db";
import { weeklyScores } from "@/lib/data";
import { addDays, formatDate, today, weekStart } from "@/lib/time";
import { Field, PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { generateWeeklyReview, saveWeeklyReview } from "@/app/actions";
import { SparkIcon } from "@/components/Icons";

const COLORS: Record<string, string> = { routine: "bg-teal", health: "bg-move", wealth: "bg-wealth", work: "bg-work", life: "bg-life" };

export default async function Review({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const sp = await searchParams;
  const current = weekStart(today());
  const ws = sp.week ? weekStart(sp.week) : current;
  const db = getDb();
  const saved = db.select().from(s.weeklyReviews).where(eq(s.weeklyReviews.weekStart, ws)).get();
  const live = weeklyScores(db, ws);
  const scores = ws === current ? live : saved?.scores && Object.keys(saved.scores).length ? saved.scores : live;
  const overall = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / 5);

  return (
    <>
      <PageHeader eyebrow={`${formatDate(ws)} – ${formatDate(addDays(ws, 6))}`} title="Weekly review" />
      <div className="flex gap-2">
        <Link href={`/review?week=${addDays(ws, -7)}`} className="btn-sm bg-soft text-ink no-underline">← Prev week</Link>
        {ws < current && <Link href={`/review?week=${addDays(ws, 7)}`} className="btn-sm bg-soft text-ink no-underline">Next week →</Link>}
      </div>

      <section className="card flex flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between">
          <span className="lbl">Scores</span>
          <span className="num text-2xl font-semibold">{overall}</span>
        </div>
        {Object.entries(scores).map(([k, v]) => (
          <div key={k} className="flex items-center gap-3 text-sm">
            <span className="w-16 capitalize">{k}</span>
            <span className="h-2 flex-1 overflow-hidden rounded bg-soft">
              <span className={`block h-full rounded ${COLORS[k]}`} style={{ width: `${v}%` }} />
            </span>
            <span className="num w-8 text-right">{v}</span>
          </div>
        ))}
        <p className="text-xs text-muted">From routine completion, steps and workouts, top-3 tasks done, quality time vs target, and fired alerts or overspent budgets.</p>
      </section>

      <Section title="Guru summary">
        <div className="card flex flex-col gap-3 p-4">
          {saved?.guruSummary ? <div className="text-sm whitespace-pre-wrap">{saved.guruSummary}</div> : <p className="text-sm text-muted">No summary yet for this week.</p>}
          <form action={generateWeeklyReview}>
            <input type="hidden" name="weekStart" value={ws} />
            <SubmitButton className="btn-primary" pendingText="Guru is reviewing…">
              <SparkIcon size={18} /> {saved?.guruSummary ? "Regenerate" : "Write my review"}
            </SubmitButton>
          </form>
        </div>
      </Section>

      <Section title="Your reflection">
        <form action={saveWeeklyReview} className="card flex flex-col gap-3 p-4">
          <input type="hidden" name="weekStart" value={ws} />
          <Field label="3 wins">
            <textarea name="wins" rows={3} defaultValue={saved?.wins ?? ""} className="textarea" />
          </Field>
          <Field label="3 misses">
            <textarea name="misses" rows={3} defaultValue={saved?.misses ?? ""} className="textarea" />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-semibold text-muted">3 commitments for next week (become pinned goals)</legend>
            {[0, 1, 2].map((i) => (
              <input key={i} name={`c${i + 1}`} defaultValue={saved?.commitments[i] ?? ""} className="input" aria-label={`Commitment ${i + 1}`} />
            ))}
          </fieldset>
          <SubmitButton>Save review</SubmitButton>
        </form>
      </Section>
    </>
  );
}
