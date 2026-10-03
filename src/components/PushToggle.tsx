"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<"unsupported" | "off" | "on" | "working" | "denied">("off");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setState("unsupported");
    if (Notification.permission === "denied") return setState("denied");
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => setState(s ? "on" : "off"));
  }, []);

  if (!publicKey) return <p className="text-sm text-muted">Push needs VAPID keys on the server (see the README).</p>;
  if (state === "unsupported") return <p className="text-sm text-muted">This browser does not support push. Install the app to your home screen first.</p>;
  if (state === "denied") return <p className="text-sm text-muted">Notifications are blocked in your browser settings.</p>;

  const enable = async () => {
    setState("working");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
    await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub) });
    setState("on");
  };
  const disable = async () => {
    setState("working");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off");
  };

  return state === "on" ? (
    <button type="button" className="btn-ghost" onClick={disable}>
      Turn off notifications
    </button>
  ) : (
    <button type="button" className="btn-primary" onClick={enable} disabled={state === "working"}>
      Turn on notifications
    </button>
  );
}
