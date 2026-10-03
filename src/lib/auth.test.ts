import { describe, expect, it } from "vitest";
import { createSession, readSession, safeEqual } from "./auth";

describe("sessions", () => {
  it("round-trips and rejects tampering and expiry", () => {
    const t = createSession("me@example.com", 1_000);
    expect(readSession(t, 2_000)).toEqual({ email: "me@example.com" });
    expect(readSession(t.replace(/.$/, (c) => (c === "A" ? "B" : "A")), 2_000)).toBeNull();
    expect(readSession(t, 1_000 + 31 * 86_400_000)).toBeNull();
    expect(readSession(undefined)).toBeNull();
  });
  it("compares secrets safely", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual(null, "abc")).toBe(false);
  });
});
