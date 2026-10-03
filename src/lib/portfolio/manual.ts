import type { BrokerAdapter } from "./types";

/** Holdings typed in on the Wealth page; prices updated by hand. Always available. */
export const manualAdapter: BrokerAdapter = {
  id: "manual",
  label: "Manual (typed-in holdings)",
  missingConfig: () => [],
  async fetchHoldings() {
    return []; // manual holdings already live in the DB; nothing to pull
  },
};
