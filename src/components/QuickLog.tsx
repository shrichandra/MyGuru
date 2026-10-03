"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { previewQuickLog, saveQuickLog } from "@/app/actions";
import type { QuickLog as Entry } from "@/lib/quicklog";
import { CheckIcon, SparkIcon } from "./Icons";

const EXAMPLES = ["lunch dal rice 2 roti", "ran 5k 28 min", "called Mom 20 min", "spent 450 on groceries", "slept 11pm-6:30am q4", "todo: send Q4 deck"];

export function QuickLog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ entry: Entry; summary: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const parse = () =>
    start(async () => {
      setError(null);
      const r = await previewQuickLog(text);
      if ("error" in r) setError(r.error);
      else setPreview(r);
    });

  const confirm = () =>
    start(async () => {
      if (!preview) return;
      const s = await saveQuickLog(preview.entry);
      setSaved(s);
      setPreview(null);
      setText("");
      input.current?.focus();
    });

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 md:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Quick log" className="w-full max-w-xl rounded-t-3xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] md:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="num text-lg font-bold">Log anything</h2>
          <button type="button" onClick={onClose} className="btn-sm bg-soft text-ink">
            Close
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (preview) confirm();
            else parse();
          }}
          className="flex gap-2"
        >
          <input
            ref={input}
            className="input"
            placeholder="lunch dal rice, ran 5k 28 min, called Ravi 20 min"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(null);
              setSaved(null);
            }}
            aria-label="What happened?"
          />
          <button type="submit" className="btn-primary shrink-0" disabled={pending || !text.trim()}>
            {pending ? "…" : preview ? "Save" : "Next"}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-alert">{error}</p>}
        {preview && (
          <div className="mt-3 flex items-center gap-2">
            <span className="chip gap-1 bg-teal-soft py-1.5 text-sm text-teal">
              <SparkIcon size={16} />
              {preview.summary}
            </span>
            <button type="button" className="btn-sm bg-teal text-white" onClick={confirm} disabled={pending}>
              Confirm
            </button>
            <button type="button" className="btn-sm bg-soft text-ink" onClick={() => setPreview(null)}>
              Edit
            </button>
          </div>
        )}
        {saved && (
          <p className="mt-3 flex items-center gap-1 text-sm font-semibold text-teal">
            <CheckIcon size={16} /> Saved: {saved}
          </p>
        )}
        {!text && !saved && (
          <div className="mt-4 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="chip cursor-pointer bg-soft py-1.5 text-muted" onClick={() => setText(ex)}>
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
