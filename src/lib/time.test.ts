import { describe, expect, it } from "vitest";
import { addDays, daysBetween, inRange, minutesBetweenTimes, today, weekStart, weekdayOf } from "./time";

describe("time helpers", () => {
  it("computes today in the app timezone, not UTC", () => {
    // 20:00 UTC on 3 Oct is 01:30 on 4 Oct in Kolkata
    expect(today(new Date("2026-10-03T20:00:00Z"), "Asia/Kolkata")).toBe("2026-10-04");
    expect(today(new Date("2026-10-03T20:00:00Z"), "UTC")).toBe("2026-10-03");
  });
  it("handles weeks and day math", () => {
    expect(weekdayOf("2026-10-04")).toBe(7); // Sunday
    expect(weekStart("2026-10-04")).toBe("2026-09-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-10-01", "2026-10-10")).toBe(9);
  });
  it("handles blocks across midnight", () => {
    expect(inRange("23:00", "21:30", "05:30")).toBe(true);
    expect(inRange("04:00", "21:30", "05:30")).toBe(true);
    expect(inRange("12:00", "21:30", "05:30")).toBe(false);
    expect(minutesBetweenTimes("23:00", "06:30")).toBe(450);
  });
});
