"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarIcon, ChartIcon, GridIcon, PlusIcon, SunIcon } from "./Icons";

const DOMAIN_PATHS = ["/domains", "/health", "/wealth", "/work", "/life"];

export function BottomNav({ onLog }: { onLog: () => void }) {
  const path = usePathname();
  const on = (p: string) => (p === "/" ? path === "/" : path.startsWith(p));
  const item = "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium no-underline";
  const cls = (active: boolean) => `${item} ${active ? "font-bold text-teal" : "text-muted"}`;
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 grid h-[76px] grid-cols-5 items-center border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:mx-auto md:max-w-xl md:rounded-t-2xl md:border-x"
    >
      <Link href="/" className={cls(on("/"))}>
        <SunIcon />
        Today
      </Link>
      <Link href="/plan" className={cls(on("/plan"))}>
        <CalendarIcon />
        Plan
      </Link>
      <button type="button" onClick={onLog} className={`${item} cursor-pointer font-semibold text-ink`}>
        <span className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-ink text-white shadow-[0_6px_16px_rgba(18,33,58,.25)]">
          <PlusIcon />
        </span>
        Log
      </button>
      <Link href="/domains" className={cls(DOMAIN_PATHS.some((p) => path.startsWith(p)))}>
        <GridIcon />
        Domains
      </Link>
      <Link href="/review" className={cls(on("/review"))}>
        <ChartIcon />
        Review
      </Link>
    </nav>
  );
}
