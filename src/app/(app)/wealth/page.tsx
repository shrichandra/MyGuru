import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/lib/db";
import { monthSpend, portfolioSummary } from "@/lib/data";
import { activeAdapter } from "@/lib/portfolio";
import { formatDate, today } from "@/lib/time";
import { money, pct } from "@/lib/format";
import { Details, Empty, Field, PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ActionButton } from "@/components/ActionButton";
import {
  addAlert,
  addExpense,
  addFinanceGoal,
  deleteAlert,
  deleteExpense,
  deleteFinanceGoal,
  deleteHolding,
  runPortfolioRefresh,
  setBudget,
  updatePrice,
  upsertHolding,
} from "@/app/actions";

const ALERT_LABEL: Record<string, string> = {
  day_drop_pct: "falls by % in a day",
  day_rise_pct: "rises by % in a day",
  price_below: "price below",
  price_above: "price above",
};

function Bar({ items, total, color }: { items: { name: string; valueCents: number }[]; total: number; color: string }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((i) => (
        <li key={i.name} className="flex items-center gap-3 text-sm">
          <span className="w-28 truncate capitalize">{i.name.replace("_", " ")}</span>
          <span className="h-2 flex-1 overflow-hidden rounded bg-soft">
            <span className={`block h-full rounded ${color}`} style={{ width: `${total ? (i.valueCents / total) * 100 : 0}%` }} />
          </span>
          <span className="num w-12 text-right text-xs text-muted">{total ? Math.round((i.valueCents / total) * 100) : 0}%</span>
        </li>
      ))}
    </ul>
  );
}

export default async function Wealth() {
  const db = getDb();
  const date = today();
  const month = date.slice(0, 7);
  const p = portfolioSummary(db);
  const adapter = activeAdapter();
  const conn = db.select().from(s.brokerConnections).where(eq(s.brokerConnections.broker, adapter.id)).get();
  const alerts = db.select().from(s.priceAlerts).all();
  const snapshots = db.select().from(s.holdingSnapshots).orderBy(desc(s.holdingSnapshots.date)).limit(30).all().reverse();
  const cats = db.select().from(s.categories).orderBy(asc(s.categories.name)).all();
  const budgets = db.select().from(s.budgets).where(eq(s.budgets.month, month)).all();
  const spend = new Map(monthSpend(db, month).map((r) => [r.categoryId, r.cents]));
  const expenses = db.select().from(s.expenses).where(sql`substr(${s.expenses.date},1,7) = ${month}`).orderBy(desc(s.expenses.date)).limit(20).all();
  const fgoals = db.select().from(s.financeGoals).all();
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const minV = Math.min(...snapshots.map((x) => x.totalValueCents));
  const maxV = Math.max(...snapshots.map((x) => x.totalValueCents));

  return (
    <>
      <PageHeader
        eyebrow={`Read-only · ${adapter.label}`}
        title="Wealth"
        action={<ActionButton action={runPortfolioRefresh} className="btn-sm bg-soft text-ink" pendingText="Refreshing…">Refresh</ActionButton>}
      />
      {conn?.lastError && <p className="rounded-xl bg-warn-soft px-4 py-2 text-sm text-warn">Broker: {conn.lastError}</p>}

      <section className="card flex flex-col gap-1 p-4">
        <span className="lbl">Portfolio value</span>
        <span className="num text-3xl font-semibold">{money(p.valueCents)}</span>
        <span className={`text-sm font-semibold ${p.dayChangeCents < 0 ? "text-alert" : "text-teal"}`}>
          {money(p.dayChangeCents)} ({pct(p.dayChangePct, 2)}) today
        </span>
        <span className="text-xs text-muted">Unrealised gain {money(p.gainCents)}</span>
        {snapshots.length > 1 && (
          <svg viewBox={`0 0 ${snapshots.length - 1} 40`} preserveAspectRatio="none" className="mt-2 h-12 w-full" role="img" aria-label="Portfolio value trend">
            <polyline
              fill="none"
              stroke="var(--color-wealth)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              points={snapshots.map((x, i) => `${i},${40 - ((x.totalValueCents - minV) / (maxV - minV || 1)) * 36 - 2}`).join(" ")}
            />
          </svg>
        )}
      </section>

      {p.holdings.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Section title="By asset class">
            <div className="card p-4">
              <Bar items={p.byClass} total={p.valueCents} color="bg-wealth" />
            </div>
          </Section>
          <Section title="By sector">
            <div className="card p-4">
              <Bar items={p.bySector} total={p.valueCents} color="bg-blue-300" />
            </div>
          </Section>
        </div>
      )}

      <Section title="Holdings">
        <div className="card flex flex-col">
          {p.holdings.length === 0 && <Empty>No holdings yet. Add them by hand below until your broker is connected.</Empty>}
          {p.holdings.map((h) => {
            const chg = h.prevCloseCents ? (h.priceCents - h.prevCloseCents) / h.prevCloseCents : 0;
            return (
              <details key={h.id} className="border-b border-soft last:border-0">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2">
                  <span className="flex flex-1 flex-col">
                    <span className="text-sm font-semibold">{h.symbol}</span>
                    <span className="text-xs text-muted">
                      {h.quantity} × {money(h.priceCents)}
                    </span>
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="num text-sm">{money(h.quantity * h.priceCents)}</span>
                    <span className={`text-xs font-semibold ${chg < 0 ? "text-alert" : "text-teal"}`}>{pct(chg, 2)}</span>
                  </span>
                </summary>
                {h.source === "manual" && (
                  <div className="flex flex-wrap items-end gap-2 px-4 pb-3">
                    <form action={updatePrice} className="flex items-end gap-2">
                      <input type="hidden" name="id" value={h.id} />
                      <Field label="New price">
                        <input name="price" type="number" step="0.01" defaultValue={h.priceCents / 100} className="input w-28" required />
                      </Field>
                      <label className="flex h-11 items-center gap-1 text-xs">
                        <input type="checkbox" name="newDay" /> new trading day
                      </label>
                      <SubmitButton className="btn-ghost">Update</SubmitButton>
                    </form>
                    <form action={deleteHolding}>
                      <input type="hidden" name="id" value={h.id} />
                      <button className="btn-sm text-alert">Remove</button>
                    </form>
                  </div>
                )}
              </details>
            );
          })}
        </div>
        <Details summary="Add or update a holding by hand">
          <form action={upsertHolding} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input name="symbol" className="input" placeholder="Symbol" required aria-label="Symbol" />
            <input name="name" className="input" placeholder="Name" aria-label="Name" />
            <select name="assetClass" className="input" aria-label="Asset class">
              {["equity", "etf", "mutual_fund", "bond", "gold", "cash"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input name="sector" className="input" placeholder="Sector" aria-label="Sector" />
            <input name="quantity" type="number" step="any" className="input" placeholder="Quantity" required aria-label="Quantity" />
            <input name="avgCost" type="number" step="0.01" className="input" placeholder="Avg cost" aria-label="Average cost" />
            <input name="price" type="number" step="0.01" className="input" placeholder="Price now" required aria-label="Price now" />
            <input name="prevClose" type="number" step="0.01" className="input" placeholder="Prev close" aria-label="Previous close" />
            <SubmitButton className="btn-primary col-span-2 sm:col-span-4">Save holding</SubmitButton>
          </form>
        </Details>
      </Section>

      {p.movers.length > 0 && (
        <Section title="Top movers today">
          <div className="card flex flex-wrap gap-2 p-4">
            {p.movers.map((m) => (
              <span key={m.symbol} className={`chip py-1 ${m.pct < 0 ? "bg-red-50 text-alert" : "bg-teal-soft text-teal"}`}>
                {m.symbol} {pct(m.pct, 1)}
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section title="Alert rules">
        <div className="card flex flex-col">
          {alerts.length === 0 && <Empty>No rules. Example: portfolio falls by 3% in a day.</Empty>}
          {alerts.map((a) => (
            <div key={a.id} className="flex items-center gap-3 border-b border-soft px-4 py-2 last:border-0">
              <span className="flex-1 text-sm">
                {a.symbol ?? "Portfolio"} {ALERT_LABEL[a.kind]} {a.threshold}
                {a.lastFiredOn && <span className="ml-2 text-xs text-muted">last fired {formatDate(a.lastFiredOn)}</span>}
              </span>
              <form action={deleteAlert}>
                <input type="hidden" name="id" value={a.id} />
                <button className="btn-sm text-faint" aria-label="Delete rule">×</button>
              </form>
            </div>
          ))}
        </div>
        <form action={addAlert} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1.5fr_100px_auto]">
          <input name="symbol" className="input" placeholder="Symbol (blank = portfolio)" aria-label="Symbol" />
          <select name="kind" className="input" aria-label="Rule">
            {Object.entries(ALERT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input name="threshold" type="number" step="any" className="input" placeholder="3" required aria-label="Threshold" />
          <SubmitButton className="btn-ghost">Add rule</SubmitButton>
        </form>
      </Section>

      <Section title="Wealth goals">
        <div className="card flex flex-col">
          {fgoals.length === 0 && <Empty>No wealth goals yet.</Empty>}
          {fgoals.map((g) => {
            const progress = g.targetCents ? Math.min(1, p.valueCents / g.targetCents) : 0;
            return (
              <div key={g.id} className="flex flex-col gap-1 border-b border-soft px-4 py-3 last:border-0">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{g.title}</span>
                  <form action={deleteFinanceGoal}>
                    <input type="hidden" name="id" value={g.id} />
                    <button className="btn-sm text-faint" aria-label="Delete goal">×</button>
                  </form>
                </div>
                <div className="h-2 overflow-hidden rounded bg-soft">
                  <div className="h-full rounded bg-wealth" style={{ width: `${progress * 100}%` }} />
                </div>
                <span className="text-xs text-muted">
                  {money(p.valueCents)} of {money(g.targetCents)} ({Math.round(progress * 100)}%){g.deadline ? ` · by ${g.deadline}` : ""}
                </span>
              </div>
            );
          })}
        </div>
        <form action={addFinanceGoal} className="grid grid-cols-2 gap-2 sm:grid-cols-[1.5fr_1fr_1fr_auto]">
          <input name="title" className="input col-span-2 sm:col-span-1" placeholder="Portfolio reaches 50L" required aria-label="Goal" />
          <input name="target" type="number" className="input" placeholder="Target amount" required aria-label="Target amount" />
          <input name="deadline" type="date" className="input" aria-label="Deadline" />
          <SubmitButton className="btn-ghost col-span-2 sm:col-span-1">Add goal</SubmitButton>
        </form>
      </Section>

      <Details summary="Optional: expenses and budgets">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">Only what you type in. No bank data is imported.</p>
          <ul className="flex flex-col gap-2">
            {cats.map((c) => {
              const b = budgets.find((x) => x.categoryId === c.id);
              const spent = spend.get(c.id) ?? 0;
              const over = b && spent > b.amountCents;
              return (
                <li key={c.id} className="flex flex-col gap-1 text-sm">
                  <div className="flex justify-between">
                    <span>{c.name}</span>
                    <span className={over ? "font-semibold text-alert" : "text-muted"}>
                      {money(spent)}
                      {b ? ` of ${money(b.amountCents)}` : ""}
                    </span>
                  </div>
                  {b && (
                    <div className="h-1.5 overflow-hidden rounded bg-soft">
                      <div className={`h-full rounded ${over ? "bg-alert" : "bg-teal"}`} style={{ width: `${Math.min(100, (spent / b.amountCents) * 100)}%` }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <form action={setBudget} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input type="hidden" name="month" value={month} />
            <select name="categoryId" className="input" aria-label="Category">
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input name="amount" type="number" className="input" placeholder="Monthly budget" required aria-label="Monthly budget" />
            <SubmitButton className="btn-ghost">Set</SubmitButton>
          </form>
          <form action={addExpense} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1.5fr_auto]">
            <input name="amount" type="number" step="0.01" className="input" placeholder="Amount" required aria-label="Amount" />
            <select name="categoryId" className="input" aria-label="Category">
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input name="note" className="input col-span-2 sm:col-span-1" placeholder="Note" aria-label="Note" />
            <SubmitButton className="btn-primary col-span-2 sm:col-span-1">Add expense</SubmitButton>
          </form>
          <ul className="flex flex-col">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center gap-3 border-b border-soft py-1.5 text-sm last:border-0">
                <span className="w-14 text-xs text-muted">{formatDate(e.date).slice(0, 6)}</span>
                <span className="flex-1">
                  {e.note ?? ""} <span className="text-xs text-muted">{e.categoryId ? catName.get(e.categoryId) : ""}</span>
                </span>
                <span className="num">{money(e.amountCents)}</span>
                <form action={deleteExpense}>
                  <input type="hidden" name="id" value={e.id} />
                  <button className="btn-sm text-faint" aria-label="Delete expense">×</button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      </Details>
      <p className="px-1 text-xs text-faint">MyGuru only reads your holdings. It cannot place orders.</p>
    </>
  );
}
