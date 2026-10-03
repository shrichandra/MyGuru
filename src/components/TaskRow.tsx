"use client";

import { useState, useTransition } from "react";
import { breakDownTask, setTaskStatus, toggleSprint } from "@/app/actions";
import { CheckIcon, SparkIcon } from "./Icons";

type Task = { id: string; title: string; status: "todo" | "doing" | "done"; estimateMin: number | null; dueDate: string | null };

export function TaskRow({ task, inSprint, subtasks = [], showSprint = true }: { task: Task; inSprint?: boolean; subtasks?: Task[]; showSprint?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const isDone = task.status === "done";
  return (
    <div className="border-b border-soft px-4 py-2 last:border-0">
      <div className="flex min-h-10 items-center gap-3">
        <button
          type="button"
          aria-label={isDone ? "Mark not done" : "Mark done"}
          disabled={pending}
          onClick={() => start(() => setTaskStatus(task.id, isDone ? "todo" : "done"))}
          className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-2 ${isDone ? "border-teal bg-teal text-white" : "border-[#B8C0CC]"}`}
        >
          {isDone && <CheckIcon size={14} />}
        </button>
        <span className={`flex-1 text-sm ${isDone ? "text-muted line-through" : ""}`}>
          {task.title}
          {task.estimateMin ? <span className="ml-2 text-xs text-faint">{task.estimateMin}m</span> : null}
          {task.dueDate ? <span className="ml-2 text-xs text-warn">due {task.dueDate}</span> : null}
        </span>
        {showSprint && !isDone && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await toggleSprint(task.id);
                setMsg(r && "error" in r && r.error ? r.error : null);
              })
            }
            className={`btn-sm ${inSprint ? "bg-work-soft text-work" : "bg-soft text-muted"}`}
          >
            {inSprint ? "In top 3" : "Top 3"}
          </button>
        )}
        {!isDone && subtasks.length === 0 && (
          <button
            type="button"
            aria-label="Break into steps with Guru"
            title="Break into steps"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await breakDownTask(task.id);
                setMsg(r.error ?? null);
              })
            }
            className="btn-sm bg-teal-soft text-teal"
          >
            <SparkIcon size={16} />
          </button>
        )}
      </div>
      {msg && <p className="pl-9 text-xs text-alert">{msg}</p>}
      {subtasks.length > 0 && (
        <ul className="ml-9 border-l border-line pl-3">
          {subtasks.map((st) => (
            <li key={st.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => start(() => setTaskStatus(st.id, st.status === "done" ? "todo" : "done"))}
                className={`flex min-h-9 w-full cursor-pointer items-center gap-2 text-left text-[13px] ${st.status === "done" ? "text-muted line-through" : ""}`}
              >
                <span className={`h-4 w-4 shrink-0 rounded border-2 ${st.status === "done" ? "border-teal bg-teal" : "border-[#B8C0CC]"}`} />
                {st.title}
                {st.estimateMin ? <span className="ml-auto text-xs text-faint">{st.estimateMin}m</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
