import { authMode } from "@/lib/auth";
import { PasscodeForm } from "./PasscodeForm";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const mode = authMode();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <div className="flex flex-col gap-1">
        <span className="lbl">MyGuru</span>
        <h1 className="num text-3xl font-bold tracking-tight">The one next right thing.</h1>
      </div>
      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-alert">{error}</p>}
      {mode === "google" && (
        <a href="/api/auth/google/start" className="btn-primary no-underline">
          Sign in with Google
        </a>
      )}
      {mode === "passcode" && <PasscodeForm />}
      {mode === "misconfigured" && (
        <p className="text-sm text-muted">Sign-in is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and ALLOWED_EMAIL, or APP_PASSCODE, plus SESSION_SECRET.</p>
      )}
      {mode === "open" && (
        <a href="/" className="btn-primary no-underline">
          Open (dev mode, no sign-in)
        </a>
      )}
    </main>
  );
}
