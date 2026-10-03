export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY ?? "INR";

export function money(cents: number, currency = CURRENCY): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

export function pct(x: number, digits = 1): string {
  return `${x >= 0 ? "+" : ""}${(x * 100).toFixed(digits)}%`;
}

export function mins(m: number): string {
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`;
}
