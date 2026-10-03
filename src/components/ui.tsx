import Link from "next/link";
import { ChevronIcon } from "./Icons";

export function PageHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        {eyebrow && <span className="lbl">{eyebrow}</span>}
        <h1 className="num text-[26px] font-bold tracking-tight">{title}</h1>
      </div>
      {action}
    </header>
  );
}

export function Section({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between px-1">
        <h2 className="lbl">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-3 text-sm text-muted">{children}</p>;
}

export function Row({ children, href, className = "" }: { children: React.ReactNode; href?: string; className?: string }) {
  const cls = `flex min-h-12 items-center gap-3 border-b border-soft px-4 py-2 last:border-0 ${className}`;
  if (href)
    return (
      <Link href={href} className={`${cls} text-ink no-underline hover:bg-ground`}>
        {children}
        <ChevronIcon size={16} className="ml-auto shrink-0 text-faint" />
      </Link>
    );
  return <div className={cls}>{children}</div>;
}

export function Details({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="card group">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold text-teal">
        {summary}
        <ChevronIcon size={16} className="transition group-open:rotate-90" />
      </summary>
      <div className="border-t border-soft p-4">{children}</div>
    </details>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-xs font-semibold text-muted ${className}`}>
      {label}
      {children}
    </label>
  );
}
