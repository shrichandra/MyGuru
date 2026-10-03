// Read-only broker adapters. The app never places orders and stores no bank data.
export interface BrokerHolding {
  symbol: string;
  name?: string;
  assetClass: string; // equity | etf | mutual_fund | bond | gold | cash
  sector?: string;
  quantity: number;
  avgCostCents: number;
  priceCents: number;
  prevCloseCents: number;
  currency: string;
}

export interface BrokerAdapter {
  id: string;
  label: string;
  /** Missing env vars or setup steps; empty when ready. */
  missingConfig(): string[];
  fetchHoldings(): Promise<BrokerHolding[]>;
  /** Latest prices for symbols; may return a subset. */
  fetchQuotes?(symbols: string[]): Promise<Record<string, { priceCents: number; prevCloseCents: number }>>;
}
