import { eq } from "drizzle-orm";
import { getDb, schema as s } from "@/lib/db";
import { authMode } from "@/lib/auth";
import { aiEnabled, DRAFT_MODEL, FAST_MODEL } from "@/lib/guru/client";
import { calendarConnected } from "@/lib/calendar/google";
import { activeAdapter } from "@/lib/portfolio";
import { pushConfigured } from "@/lib/push";
import { APP_TIMEZONE } from "@/lib/time";
import { PageHeader, Section } from "@/components/ui";
import { PushToggle } from "@/components/PushToggle";
import { logout } from "@/app/actions";

function Status({ ok, label, children }: { ok: boolean; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-soft px-4 py-3 last:border-0">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <span className={`chip ${ok ? "bg-teal-soft text-teal" : "bg-warn-soft text-warn"}`}>{ok ? "Ready" : "Needs setup"}</span>
      </div>
      <div className="text-sm text-muted">{children}</div>
    </div>
  );
}

export default async function Settings() {
  const db = getDb();
  const mode = authMode();
  const adapter = activeAdapter();
  const missing = adapter.missingConfig();
  const conn = db.select().from(s.brokerConnections).where(eq(s.brokerConnections.broker, adapter.id)).get();
  const lastHealth = db.select().from(s.healthMetrics).orderBy(s.healthMetrics.updatedAt).all().at(-1);
  const google = mode === "google";

  return (
    <>
      <PageHeader title="Settings" />
      <Section title="Connections">
        <div className="card flex flex-col">
          <Status ok={mode === "google" || mode === "passcode"} label="Sign-in">
            {mode === "google" && `Google sign-in, locked to ${process.env.ALLOWED_EMAIL}.`}
            {mode === "passcode" && "Passcode sign-in. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and ALLOWED_EMAIL to switch to Google."}
            {mode === "open" && "Open (local development only). Production refuses to run without sign-in configured."}
          </Status>
          <Status ok={aiEnabled()} label="Guru AI">
            {aiEnabled() ? `On. Drafts and reviews use ${DRAFT_MODEL}; quick logs use ${FAST_MODEL}.` : "Off: set ANTHROPIC_API_KEY. Until then the briefing, task breakdown and quick log use built-in rules."}
          </Status>
          <Status ok={calendarConnected(db)} label="Google Calendar (read-only)">
            {calendarConnected(db) ? (
              "Connected. Events sync every 15 minutes and on demand from Plan."
            ) : google ? (
              <a href="/api/auth/google/start">Connect Google Calendar</a>
            ) : (
              "Needs Google sign-in configured first (same consent screen grants Calendar read-only)."
            )}
          </Status>
          <Status ok={adapter.id !== "manual" && !missing.length && conn?.status === "ok"} label="Stock portfolio">
            {adapter.id === "manual"
              ? "Manual holdings for now. Tell Claude which broker you use, then set BROKER and its read-only API keys."
              : missing.length
                ? `${adapter.label}: missing ${missing.join(", ")}.`
                : conn?.lastError ?? `${adapter.label}: last sync ${conn?.lastSyncAt ?? "never"}.`}
          </Status>
          <Status ok={Boolean(lastHealth)} label="Health Connect (Android)">
            {lastHealth
              ? `Last synced ${lastHealth.updatedAt.slice(0, 16).replace("T", " ")} UTC.`
              : "Install the MyGuru Android app (mobile/README.md) and sign in there; it syncs steps, sleep and workouts every time you open it."}
          </Status>
          <Status ok={pushConfigured()} label="Notifications">
            <PushToggle publicKey={process.env.VAPID_PUBLIC_KEY ?? null} />
          </Status>
        </div>
      </Section>
      <Section title="Data">
        <div className="card flex flex-col gap-2 p-4 text-sm">
          <p>Timezone: {APP_TIMEZONE}. Currency: {process.env.NEXT_PUBLIC_CURRENCY ?? "INR"}.</p>
          <a href="/api/export" className="btn-ghost w-fit no-underline">Download all data (JSON)</a>
        </div>
      </Section>
      {mode !== "open" && (
        <form action={logout}>
          <button className="btn-ghost">Sign out</button>
        </form>
      )}
    </>
  );
}
