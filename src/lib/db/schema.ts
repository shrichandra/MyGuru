import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

// Every row: text UUID id, created_at, updated_at. Dates are ISO text (YYYY-MM-DD),
// times are "HH:MM", money is integer cents with a currency code.
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const stamps = {
  createdAt: text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`)
    .$onUpdateFn(() => new Date().toISOString()),
};

// ---------- Core ----------
export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  currency: text("currency").notNull().default("INR"),
  wakeTime: text("wake_time").notNull().default("06:00"),
  bedTime: text("bed_time").notNull().default("22:30"),
  ...stamps,
});

export const oauthTokens = sqliteTable("oauth_tokens", {
  id: id(),
  provider: text("provider").notNull().unique(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: integer("expires_at"),
  scope: text("scope"),
  ...stamps,
});

export const timeBlocks = sqliteTable("time_blocks", {
  id: id(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["morning", "deep_work", "afternoon", "evening", "wind_down"] }).notNull(),
  start: text("start").notNull(),
  end: text("end").notNull(),
  sort: integer("sort").notNull().default(0),
  ...stamps,
});

export const goals = sqliteTable("goals", {
  id: id(),
  title: text("title").notNull(),
  domain: text("domain", { enum: ["routine", "health", "wealth", "work", "life"] }).notNull(),
  metric: text("metric"),
  target: real("target"),
  current: real("current"),
  deadline: text("deadline"),
  status: text("status", { enum: ["active", "done", "dropped"] }).notNull().default("active"),
  pinnedWeek: text("pinned_week"),
  ...stamps,
});

export const journalEntries = sqliteTable("journal_entries", {
  id: id(),
  date: text("date").notNull(),
  text: text("text").notNull(),
  ...stamps,
});

// One row per thing that happened; the Log tab and the Guru context read this.
export const logEntries = sqliteTable(
  "log_entries",
  {
    id: id(),
    date: text("date").notNull(),
    at: text("at").notNull(),
    domain: text("domain", { enum: ["routine", "health", "wealth", "work", "life"] }).notNull(),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    refTable: text("ref_table"),
    refId: text("ref_id"),
    ...stamps,
  },
  (t) => [index("log_entries_date_idx").on(t.date)],
);

// ---------- Routines ----------
export const routines = sqliteTable("routines", {
  id: id(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["morning", "evening", "custom"] }).notNull().default("custom"),
  // ISO weekdays the routine runs on, "1234567" = every day (1 = Monday)
  days: text("days").notNull().default("1234567"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  ...stamps,
});

export const routineSteps = sqliteTable("routine_steps", {
  id: id(),
  routineId: text("routine_id")
    .notNull()
    .references(() => routines.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  minutes: integer("minutes").notNull().default(5),
  sort: integer("sort").notNull().default(0),
  ...stamps,
});

export const routineRuns = sqliteTable(
  "routine_runs",
  {
    id: id(),
    routineId: text("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    completedStepIds: text("completed_step_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
    finishedAt: text("finished_at"),
    ...stamps,
  },
  (t) => [uniqueIndex("routine_runs_routine_date").on(t.routineId, t.date)],
);

export const habits = sqliteTable("habits", {
  id: id(),
  name: text("name").notNull(),
  domain: text("domain", { enum: ["routine", "health", "wealth", "work", "life"] }).notNull().default("routine"),
  targetPerWeek: integer("target_per_week").notNull().default(7),
  goalId: text("goal_id").references(() => goals.id, { onDelete: "set null" }),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  ...stamps,
});

export const habitCheckins = sqliteTable(
  "habit_checkins",
  {
    id: id(),
    habitId: text("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    ...stamps,
  },
  (t) => [uniqueIndex("habit_checkins_habit_date").on(t.habitId, t.date)],
);

export const sleepLogs = sqliteTable(
  "sleep_logs",
  {
    id: id(),
    date: text("date").notNull(), // the morning you woke up
    bedTime: text("bed_time"),
    wakeTime: text("wake_time"),
    minutes: integer("minutes"),
    quality: integer("quality"), // 1..5
    source: text("source", { enum: ["manual", "health_connect"] }).notNull().default("manual"),
    ...stamps,
  },
  (t) => [uniqueIndex("sleep_logs_date_source").on(t.date, t.source)],
);

// ---------- Health ----------
export const healthMetrics = sqliteTable(
  "health_metrics",
  {
    id: id(),
    date: text("date").notNull(),
    kind: text("kind", { enum: ["steps", "active_minutes", "resting_hr", "weight_kg"] }).notNull(),
    value: real("value").notNull(),
    source: text("source").notNull().default("health_connect"),
    ...stamps,
  },
  (t) => [uniqueIndex("health_metrics_date_kind_source").on(t.date, t.kind, t.source)],
);

export const workoutPlans = sqliteTable("workout_plans", {
  id: id(),
  dayOfWeek: integer("day_of_week").notNull(), // 1 = Monday
  title: text("title").notNull(),
  details: text("details"),
  ...stamps,
});

export const workoutSessions = sqliteTable("workout_sessions", {
  id: id(),
  date: text("date").notNull(),
  title: text("title").notNull(),
  minutes: integer("minutes"),
  distanceKm: real("distance_km"),
  notes: text("notes"),
  planId: text("plan_id").references(() => workoutPlans.id, { onDelete: "set null" }),
  source: text("source").notNull().default("manual"),
  externalId: text("external_id").unique(),
  ...stamps,
});

export const exerciseSets = sqliteTable("exercise_sets", {
  id: id(),
  sessionId: text("session_id")
    .notNull()
    .references(() => workoutSessions.id, { onDelete: "cascade" }),
  exercise: text("exercise").notNull(),
  sets: integer("sets"),
  reps: integer("reps"),
  weightKg: real("weight_kg"),
  minutes: integer("minutes"),
  ...stamps,
});

export const meals = sqliteTable("meals", {
  id: id(),
  date: text("date").notNull(),
  mealType: text("meal_type", { enum: ["breakfast", "lunch", "dinner", "snack"] }).notNull(),
  description: text("description").notNull(),
  calories: integer("calories"),
  proteinG: integer("protein_g"),
  carbsG: integer("carbs_g"),
  fatG: integer("fat_g"),
  ...stamps,
});

export const mealPlans = sqliteTable("meal_plans", {
  id: id(),
  dayOfWeek: integer("day_of_week").notNull(),
  mealType: text("meal_type", { enum: ["breakfast", "lunch", "dinner", "snack"] }).notNull(),
  description: text("description").notNull(),
  ...stamps,
});

// ---------- Wealth (read-only portfolio + optional manual expenses) ----------
export const brokerConnections = sqliteTable("broker_connections", {
  id: id(),
  broker: text("broker").notNull().unique(),
  status: text("status", { enum: ["not_configured", "ok", "error"] }).notNull().default("not_configured"),
  lastSyncAt: text("last_sync_at"),
  lastError: text("last_error"),
  ...stamps,
});

export const holdings = sqliteTable("holdings", {
  id: id(),
  symbol: text("symbol").notNull().unique(),
  name: text("name"),
  assetClass: text("asset_class").notNull().default("equity"),
  sector: text("sector"),
  quantity: real("quantity").notNull(),
  avgCostCents: integer("avg_cost_cents").notNull().default(0),
  priceCents: integer("price_cents").notNull().default(0),
  prevCloseCents: integer("prev_close_cents").notNull().default(0),
  currency: text("currency").notNull().default("INR"),
  source: text("source").notNull().default("manual"),
  ...stamps,
});

export const holdingSnapshots = sqliteTable("holding_snapshots", {
  id: id(),
  date: text("date").notNull().unique(),
  totalValueCents: integer("total_value_cents").notNull(),
  dayChangeCents: integer("day_change_cents").notNull(),
  ...stamps,
});

export const priceAlerts = sqliteTable("price_alerts", {
  id: id(),
  // symbol is null for portfolio-wide rules
  symbol: text("symbol"),
  kind: text("kind", { enum: ["day_drop_pct", "day_rise_pct", "price_below", "price_above"] }).notNull(),
  threshold: real("threshold").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  lastFiredOn: text("last_fired_on"),
  ...stamps,
});

export const categories = sqliteTable("categories", {
  id: id(),
  name: text("name").notNull().unique(),
  ...stamps,
});

export const budgets = sqliteTable(
  "budgets",
  {
    id: id(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    month: text("month").notNull(), // YYYY-MM
    amountCents: integer("amount_cents").notNull(),
    ...stamps,
  },
  (t) => [uniqueIndex("budgets_category_month").on(t.categoryId, t.month)],
);

export const expenses = sqliteTable("expenses", {
  id: id(),
  date: text("date").notNull(),
  categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("INR"),
  note: text("note"),
  ...stamps,
});

export const financeGoals = sqliteTable("finance_goals", {
  id: id(),
  title: text("title").notNull(),
  targetCents: integer("target_cents").notNull(),
  deadline: text("deadline"),
  ...stamps,
});

// ---------- Work ----------
export const projects = sqliteTable("projects", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status", { enum: ["active", "paused", "done"] }).notNull().default("active"),
  goalId: text("goal_id").references(() => goals.id, { onDelete: "set null" }),
  ...stamps,
});

export const tasks = sqliteTable("tasks", {
  id: id(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  parentId: text("parent_id"),
  title: text("title").notNull(),
  notes: text("notes"),
  status: text("status", { enum: ["todo", "doing", "done"] }).notNull().default("todo"),
  estimateMin: integer("estimate_min"),
  dueDate: text("due_date"),
  completedAt: text("completed_at"),
  sort: integer("sort").notNull().default(0),
  ...stamps,
});

// The daily sprint: up to 3 tasks picked for a date.
export const sprintItems = sqliteTable(
  "sprint_items",
  {
    id: id(),
    date: text("date").notNull(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    sort: integer("sort").notNull().default(0),
    ...stamps,
  },
  (t) => [uniqueIndex("sprint_items_date_task").on(t.date, t.taskId)],
);

export const commsDocs = sqliteTable("comms_docs", {
  id: id(),
  kind: text("kind", { enum: ["meeting_prep", "exec_update", "scqa", "pyramid"] }).notNull(),
  title: text("title").notNull(),
  fields: text("fields", { mode: "json" }).$type<Record<string, string>>().notNull().default({}),
  draft: text("draft"),
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  meetingAt: text("meeting_at"),
  ...stamps,
});

export const calendarEvents = sqliteTable(
  "calendar_events",
  {
    id: id(),
    externalId: text("external_id").notNull().unique(),
    date: text("date").notNull(),
    startAt: text("start_at").notNull(),
    endAt: text("end_at").notNull(),
    title: text("title").notNull(),
    location: text("location"),
    allDay: integer("all_day", { mode: "boolean" }).notNull().default(false),
    ...stamps,
  },
  (t) => [index("calendar_events_date_idx").on(t.date)],
);

// ---------- Personal life ----------
export const people = sqliteTable("people", {
  id: id(),
  name: text("name").notNull(),
  relation: text("relation"),
  contactEveryDays: integer("contact_every_days").notNull().default(14),
  birthday: text("birthday"),
  notes: text("notes"),
  ...stamps,
});

export const touchpoints = sqliteTable("touchpoints", {
  id: id(),
  personId: text("person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  kind: text("kind", { enum: ["call", "meet", "message", "quality_time"] }).notNull(),
  minutes: integer("minutes").notNull().default(0),
  notes: text("notes"),
  ...stamps,
});

export const hobbies = sqliteTable("hobbies", {
  id: id(),
  name: text("name").notNull(),
  weeklyTargetMin: integer("weekly_target_min").notNull().default(120),
  ...stamps,
});

export const hobbySessions = sqliteTable("hobby_sessions", {
  id: id(),
  hobbyId: text("hobby_id")
    .notNull()
    .references(() => hobbies.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  minutes: integer("minutes").notNull(),
  notes: text("notes"),
  ...stamps,
});

export const milestones = sqliteTable("milestones", {
  id: id(),
  hobbyId: text("hobby_id")
    .notNull()
    .references(() => hobbies.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  dueDate: text("due_date"),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  ...stamps,
});

// ---------- Guru + review + push ----------
export const guruRuns = sqliteTable("guru_runs", {
  id: id(),
  kind: text("kind").notNull(),
  inputSummary: text("input_summary"),
  output: text("output").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  rating: integer("rating"),
  ...stamps,
});

export const weeklyReviews = sqliteTable("weekly_reviews", {
  id: id(),
  weekStart: text("week_start").notNull().unique(),
  scores: text("scores", { mode: "json" }).$type<Record<string, number>>().notNull().default({}),
  wins: text("wins"),
  misses: text("misses"),
  guruSummary: text("guru_summary"),
  commitments: text("commitments", { mode: "json" }).$type<string[]>().notNull().default([]),
  ...stamps,
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: id(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  ...stamps,
});
