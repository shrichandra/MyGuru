import Link from "next/link";
import { getDb } from "@/lib/db";
import { pulse } from "@/lib/data";
import { today } from "@/lib/time";
import { PageHeader } from "@/components/ui";
import { ChevronIcon } from "@/components/Icons";
import { mins, pct } from "@/lib/format";

export default async function Domains() {
  const p = pulse(getDb(), today());
  const items = [
    { href: "/health", name: "Health", sub: "Workouts, meals, steps and sleep", stat: `${Math.round(p.move * 100)}% moved`, color: "bg-move" },
    { href: "/wealth", name: "Wealth", sub: "Portfolio monitor, alerts, optional budgets", stat: p.wealthDayPct === null ? "no holdings" : pct(p.wealthDayPct), color: "bg-wealth" },
    { href: "/work", name: "Work", sub: "Projects, top 3, meeting prep and exec updates", stat: `${p.workDone}/${p.workTotal} today`, color: "bg-work" },
    { href: "/life", name: "Life", sub: "People, quality time, hobbies", stat: `${mins(p.lifeMinutes)} this week`, color: "bg-life" },
    { href: "/log", name: "Log", sub: "Everything logged today", stat: "", color: "bg-ink" },
  ];
  return (
    <>
      <PageHeader title="Domains" />
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="card flex items-center gap-4 p-4 text-ink no-underline hover:bg-white/80">
            <span className={`h-3 w-3 shrink-0 rounded-full ${i.color}`} aria-hidden />
            <span className="flex flex-1 flex-col">
              <span className="text-lg font-bold">{i.name}</span>
              <span className="text-sm text-muted">{i.sub}</span>
            </span>
            <span className="num text-sm font-semibold text-muted">{i.stat}</span>
            <ChevronIcon size={16} className="text-faint" />
          </Link>
        ))}
      </div>
    </>
  );
}
