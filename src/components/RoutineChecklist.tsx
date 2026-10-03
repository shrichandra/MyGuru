"use client";

import { useEffect, useState, useTransition } from "react";
import { toggleRoutineStep } from "@/app/actions";
import { CheckIcon } from "./Icons";

type Step = { id: string; title: string; minutes: number; done: boolean };

/** Run mode: tick steps, with a countdown for the current step. */
export function RoutineChecklist({ routineId, steps, compact = false }: { routineId: string; steps: Step[]; compact?: boolean }) {
  const [pending, start] = useTransition();
  const current = steps.find((s) => !s.done);
  const [left, setLeft] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setLeft(current ? current.minutes * 60 : null);
    setRunning(false);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLeft((l) => (l && l > 0 ? l - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (running && left === 0 && "vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
  }, [left, running]);

  const toggle = (id: string) => start(() => toggleRoutineStep(routineId, id));
  const doneCount = steps.filter((s) => s.done).length;
  const mmss = left === null ? "--:--" : `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between">
        <span className="text-[13px] text-muted">
          {current ? `Step ${doneCount + 1} of ${steps.length} · ${current.title}` : `All ${steps.length} steps done`}
        </span>
        {current && (
          <button type="button" onClick={() => setRunning((r) => !r)} className="num cursor-pointer text-[32px] font-semibold tracking-tight text-teal" aria-label={running ? "Pause timer" : "Start timer"}>
            {mmss}
          </button>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-line">
        <div className="h-full rounded bg-teal transition-all" style={{ width: `${steps.length ? (doneCount / steps.length) * 100 : 0}%` }} />
      </div>
      <ul className="flex flex-col">
        {(compact ? steps.slice(Math.max(0, doneCount - 1), doneCount + 3) : steps).map((s) => (
          <li key={s.id}>
            <button type="button" disabled={pending} onClick={() => toggle(s.id)} className={`flex min-h-10 w-full cursor-pointer items-center gap-3 text-left text-sm ${s.done ? "text-muted" : s.id === current?.id ? "font-semibold" : ""}`}>
              {s.done ? (
                <CheckIcon size={20} className="text-teal" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
                  <circle cx="12" cy="12" r="7" fill="none" stroke={s.id === current?.id ? "var(--color-teal)" : "#B8C0CC"} strokeWidth="2" />
                  {s.id === current?.id && <circle cx="12" cy="12" r="3.5" fill="var(--color-teal)" />}
                </svg>
              )}
              <span className={s.done ? "line-through" : ""}>{s.title}</span>
              <span className="ml-auto text-xs text-faint">{s.minutes}m</span>
            </button>
          </li>
        ))}
      </ul>
      {current && (
        <div className="flex gap-2">
          <button type="button" className="btn-primary flex-1" disabled={pending} onClick={() => toggle(current.id)}>
            Done, next step
          </button>
          <button type="button" className="btn-ghost" onClick={() => setRunning((r) => !r)}>
            {running ? "Pause" : "Start timer"}
          </button>
        </div>
      )}
    </div>
  );
}
