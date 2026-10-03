import Link from "next/link";

export function Ring({ value, color, label, text, href }: { value: number; color: string; label: string; text: string; href: string }) {
  const v = Math.max(0, Math.min(1, value)) * 100;
  return (
    <Link href={href} className="flex flex-col items-center gap-1 text-ink no-underline">
      <svg width="48" height="48" viewBox="0 0 44 44" role="img" aria-label={`${label}: ${text}`}>
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--color-line)" strokeWidth="5" />
        {v > 0 && (
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${v} 100`}
            transform="rotate(-90 22 22)"
          />
        )}
        <text x="22" y="26" textAnchor="middle" fontSize={text.length > 4 ? 9.5 : 11} fontWeight="700" fill="var(--color-ink)" fontFamily="Space Grotesk, ui-sans-serif, system-ui, sans-serif">
          {text}
        </text>
      </svg>
      <span className="text-[11px] font-semibold">{label}</span>
    </Link>
  );
}
