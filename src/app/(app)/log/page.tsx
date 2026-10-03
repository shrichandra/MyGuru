import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema as s } from "@/lib/db";
import { addDays, formatDate, today } from "@/lib/time";
import { Empty, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/ActionButton";
import { removeLogEntry } from "@/app/actions";

const DOMAINS = ["all", "routine", "health", "wealth", "work", "life"] as const;
const COLORS: Record<string, string> = {
  routine: "bg-teal-soft text-teal",
  health: "bg-orange-50 text-move",
  wealth: "bg-blue-50 text-wealth",
  work: "bg-work-soft text-work",
  life: "bg-pink-50 text-life",
};

export default async function LogPage({ searchParams }: { searchParams: Promise<{ d?: string; date?: string }> }) {
  const sp = await searchParams;
  const date = sp.date ?? today();
  const domain = DOMAINS.includes(sp.d as never) ? sp.d! : "all";
  const db = getDb();
  const rows = db.select().from(s.logEntries).where(eq(s.logEntries.date, date)).orderBy(desc(s.logEntries.at)).all().filter((r) => domain === "all" || r.domain === domain);
  const q = (o: Record<string, string>) => `?${new URLSearchParams({ date, d: domain, ...o })}`;

  return (
    <>
      <PageHeader eyebrow="Everything logged" title={formatDate(date)} />
      <div className="flex items-center gap-2">
        <Link href={q({ date: addDays(date, -1) })} className="btn-sm bg-soft text-ink no-underline">← Prev</Link>
        {date !== today() && <Link href={q({ date: today() })} className="btn-sm bg-soft text-ink no-underline">Today</Link>}
        {date < today() && <Link href={q({ date: addDays(date, 1) })} className="btn-sm bg-soft text-ink no-underline">Next →</Link>}
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="Filter by domain">
        {DOMAINS.map((d) => (
          <Link key={d} href={q({ d })} className={`chip py-1.5 no-underline ${d === domain ? "bg-ink text-white" : "bg-soft text-muted"}`}>
            {d}
          </Link>
        ))}
      </nav>
      <div className="card flex flex-col">
        {rows.length === 0 && <Empty>Nothing logged yet. Tap + Log to add something.</Empty>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 border-b border-soft px-4 py-2 last:border-0">
            <span className="num w-11 text-sm font-semibold">{r.at}</span>
            <span className={`chip ${COLORS[r.domain]}`}>{r.domain}</span>
            <span className="flex-1 text-sm">{r.summary}</span>
            <ActionButton action={removeLogEntry.bind(null, r.id)} className="btn-sm text-faint">
              <span aria-label="Remove from log">×</span>
            </ActionButton>
          </div>
        ))}
      </div>
      <p className="px-1 text-xs text-faint">Removing a line here hides it from the log; the record stays in its module.</p>
    </>
  );
}
