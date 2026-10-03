"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BottomNav } from "./BottomNav";
import { QuickLog } from "./QuickLog";

export function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const params = useSearchParams();
  useEffect(() => {
    if (params.get("log") === "1") setOpen(true);
  }, [params]);
  return (
    <>
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-5 pb-28 lg:max-w-5xl">{children}</main>
      <BottomNav onLog={() => setOpen(true)} />
      {open && <QuickLog onClose={() => setOpen(false)} />}
    </>
  );
}
