"use client";

import { useActionState } from "react";
import { passcodeLogin } from "@/app/actions";

export function PasscodeForm() {
  const [state, action, pending] = useActionState(passcodeLogin, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input name="passcode" type="password" autoComplete="current-password" className="input" placeholder="Passcode" aria-label="Passcode" required />
      {state?.error && <p className="text-sm text-alert">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>
        Sign in
      </button>
    </form>
  );
}
