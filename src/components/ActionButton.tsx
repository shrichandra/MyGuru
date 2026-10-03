"use client";

import { useTransition } from "react";

/** A button that calls a server action with no form fields. */
export function ActionButton({ action, children, className = "btn-ghost", pendingText }: { action: () => Promise<unknown>; children: React.ReactNode; className?: string; pendingText?: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className={className} disabled={pending} onClick={() => start(async () => void (await action()))}>
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
