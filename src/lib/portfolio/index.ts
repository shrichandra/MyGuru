import { eq } from "drizzle-orm";
import { type DB, schema as s } from "../db";
import { addLog, portfolioSummary } from "../data";
import { today } from "../time";
import { kiteAdapter } from "./kite";
import { manualAdapter } from "./manual";
import type { BrokerAdapter } from "./types";
import { pct } from "../format";

export const ADAPTERS: Record<string, BrokerAdapter> = { manual: manualAdapter, kite: kiteAdapter };

export function activeAdapter(): BrokerAdapter {
  return ADAPTERS[process.env.BROKER ?? "manual"] ?? manualAdapter;
}

/** Pull holdings from the configured broker (if any), snapshot the day, and evaluate alert rules. */
export async function refreshPortfolio(db: DB): Promise<{ fired: string[]; synced: number }> {
  const adapter = activeAdapter();
  let synced = 0;
  if (adapter.id !== "manual") {
    const missing = adapter.missingConfig();
    const conn = { broker: adapter.id };
    if (missing.length) {
      db.insert(s.brokerConnections)
        .values({ ...conn, status: "not_configured", lastError: `Missing: ${missing.join(", ")}` })
        .onConflictDoUpdate({ target: s.brokerConnections.broker, set: { status: "not_configured", lastError: `Missing: ${missing.join(", ")}` } })
        .run();
    } else {
      try {
        const hs = await adapter.fetchHoldings();
        db.transaction((tx) => {
          for (const h of hs) {
            tx.insert(s.holdings)
              .values({ ...h, source: adapter.id })
              .onConflictDoUpdate({ target: s.holdings.symbol, set: { ...h, source: adapter.id } })
              .run();
          }
        });
        synced = hs.length;
        const now = new Date().toISOString();
        db.insert(s.brokerConnections)
          .values({ ...conn, status: "ok", lastSyncAt: now, lastError: null })
          .onConflictDoUpdate({ target: s.brokerConnections.broker, set: { status: "ok", lastSyncAt: now, lastError: null } })
          .run();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        db.insert(s.brokerConnections)
          .values({ ...conn, status: "error", lastError: msg })
          .onConflictDoUpdate({ target: s.brokerConnections.broker, set: { status: "error", lastError: msg } })
          .run();
      }
    }
  }
  snapshotPortfolio(db);
  return { fired: evaluateAlerts(db), synced };
}

export function snapshotPortfolio(db: DB, date = today()) {
  const p = portfolioSummary(db);
  if (!p.holdings.length) return;
  db.insert(s.holdingSnapshots)
    .values({ date, totalValueCents: p.valueCents, dayChangeCents: p.dayChangeCents })
    .onConflictDoUpdate({ target: s.holdingSnapshots.date, set: { totalValueCents: p.valueCents, dayChangeCents: p.dayChangeCents } })
    .run();
}

/** Fire each active rule at most once per day. Returns human-readable messages for newly fired rules. */
export function evaluateAlerts(db: DB, date = today()): string[] {
  const p = portfolioSummary(db);
  const bySymbol = new Map(p.holdings.map((h) => [h.symbol.toUpperCase(), h]));
  const fired: string[] = [];
  for (const a of db.select().from(s.priceAlerts).where(eq(s.priceAlerts.active, true)).all()) {
    if (a.lastFiredOn === date) continue;
    let msg: string | null = null;
    if (!a.symbol) {
      if (a.kind === "day_drop_pct" && p.dayChangePct <= -a.threshold / 100) msg = `Portfolio ${pct(p.dayChangePct)} today`;
      if (a.kind === "day_rise_pct" && p.dayChangePct >= a.threshold / 100) msg = `Portfolio ${pct(p.dayChangePct)} today`;
    } else {
      const h = bySymbol.get(a.symbol.toUpperCase());
      if (!h) continue;
      const change = h.prevCloseCents ? (h.priceCents - h.prevCloseCents) / h.prevCloseCents : 0;
      const price = h.priceCents / 100;
      if (a.kind === "day_drop_pct" && change <= -a.threshold / 100) msg = `${h.symbol} ${pct(change)} today`;
      if (a.kind === "day_rise_pct" && change >= a.threshold / 100) msg = `${h.symbol} ${pct(change)} today`;
      if (a.kind === "price_below" && price < a.threshold) msg = `${h.symbol} below ${a.threshold} (now ${price})`;
      if (a.kind === "price_above" && price > a.threshold) msg = `${h.symbol} above ${a.threshold} (now ${price})`;
    }
    if (msg) {
      db.update(s.priceAlerts).set({ lastFiredOn: date }).where(eq(s.priceAlerts.id, a.id)).run();
      addLog(db, { domain: "wealth", kind: "alert", summary: msg, refTable: "price_alerts", refId: a.id, date });
      fired.push(msg);
    }
  }
  return fired;
}
