import { describe, expect, it } from "vitest";
import { parseClock, parseQuickLog } from "./quicklog";

const ctx = { people: ["Mom", "Ravi"], hobbies: ["Guitar"], categories: ["Food", "Transport", "Home", "Health", "Fun", "Other"], nowHHMM: "13:10" };

describe("parseQuickLog", () => {
  it("parses meals with the meal word", () => {
    expect(parseQuickLog("lunch dal rice 2 roti", ctx)).toEqual({ type: "meal", mealType: "lunch", description: "dal rice 2 roti", calories: null });
  });
  it("infers the meal from the clock for 'ate'", () => {
    expect(parseQuickLog("ate a banana", { ...ctx, nowHHMM: "08:00" })).toMatchObject({ type: "meal", mealType: "breakfast" });
  });
  it("parses runs with distance and minutes", () => {
    expect(parseQuickLog("ran 5k 28 min", ctx)).toEqual({ type: "workout", title: "ran 5k 28 min", minutes: 28, distanceKm: 5 });
  });
  it("parses calls with known people", () => {
    expect(parseQuickLog("called Ravi 20 min", ctx)).toEqual({ type: "touchpoint", personName: "Ravi", kind: "call", minutes: 20 });
  });
  it("parses calls with new people by capitalised name", () => {
    expect(parseQuickLog("met Priya for coffee 1h", ctx)).toMatchObject({ type: "touchpoint", personName: "Priya", kind: "meet", minutes: 60 });
  });
  it("parses expenses and guesses categories", () => {
    expect(parseQuickLog("spent 450 on uber", ctx)).toMatchObject({ type: "expense", amount: 450, category: "Transport" });
    expect(parseQuickLog("₹1,200 groceries food", ctx)).toMatchObject({ type: "expense", amount: 1200, category: "Food" });
  });
  it("parses sleep ranges with quality", () => {
    expect(parseQuickLog("slept 11pm-6:30am q4", ctx)).toEqual({ type: "sleep", bedTime: "23:00", wakeTime: "06:30", minutes: null, quality: 4 });
  });
  it("parses hobbies and tasks", () => {
    expect(parseQuickLog("guitar 45 min", ctx)).toEqual({ type: "hobby", hobbyName: "Guitar", minutes: 45 });
    expect(parseQuickLog("todo: send Q4 deck", ctx)).toEqual({ type: "task", title: "send Q4 deck" });
  });
  it("falls back to a journal note", () => {
    expect(parseQuickLog("felt focused today", ctx)).toEqual({ type: "journal", text: "felt focused today" });
  });
});

describe("parseClock", () => {
  it("handles 12h and 24h", () => {
    expect(parseClock("12am")).toBe("00:00");
    expect(parseClock("12:30pm")).toBe("12:30");
    expect(parseClock("23:15")).toBe("23:15");
    expect(parseClock("25:00")).toBeNull();
  });
});
