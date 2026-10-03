import type { BrokerAdapter, BrokerHolding } from "./types";

// Placeholder for a read-only broker adapter. Zerodha Kite Connect is shown as the example
// shape because it exposes a read-only holdings endpoint; swap in the broker Shri actually uses.
// Credentials come from Secret Manager via env vars, never from the repo or the database.
export const kiteAdapter: BrokerAdapter = {
  id: "kite",
  label: "Zerodha Kite Connect (example, not yet wired)",
  missingConfig() {
    const missing: string[] = [];
    if (!process.env.KITE_API_KEY) missing.push("KITE_API_KEY");
    if (!process.env.KITE_ACCESS_TOKEN) missing.push("KITE_ACCESS_TOKEN (refreshed daily via the Kite login flow)");
    return missing;
  },
  async fetchHoldings(): Promise<BrokerHolding[]> {
    const res = await fetch("https://api.kite.trade/portfolio/holdings", {
      headers: {
        "X-Kite-Version": "3",
        Authorization: `token ${process.env.KITE_API_KEY}:${process.env.KITE_ACCESS_TOKEN}`,
      },
    });
    if (!res.ok) throw new Error(`Kite holdings failed: ${res.status}`);
    const body = (await res.json()) as {
      data: { tradingsymbol: string; quantity: number; average_price: number; last_price: number; close_price: number }[];
    };
    return body.data.map((h) => ({
      symbol: h.tradingsymbol,
      assetClass: "equity",
      quantity: h.quantity,
      avgCostCents: Math.round(h.average_price * 100),
      priceCents: Math.round(h.last_price * 100),
      prevCloseCents: Math.round(h.close_price * 100),
      currency: "INR",
    }));
  },
};
