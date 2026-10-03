import { Suspense } from "react";
import { Shell } from "@/components/Shell";
import { NativeHealthSync } from "@/components/NativeHealthSync";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <Shell>{children}</Shell>
      <NativeHealthSync />
    </Suspense>
  );
}
