import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { DB } from "../db";
import { schema as s } from "../db";

// Model choice per the plan: a stronger model for drafts and reviews, a fast one for parsing quick logs.
// Both are overridable from the environment.
export const DRAFT_MODEL = process.env.GURU_MODEL ?? "claude-sonnet-5-5";
export const FAST_MODEL = process.env.GURU_FAST_MODEL ?? "claude-haiku-4-5";

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function anthropic() {
  client ??= new Anthropic();
  return client;
}

const GURU_SYSTEM = `You are Guru, the coach inside MyGuru, a personal life operating system for one person.
You are direct, warm and practical. You never invent data: use only the facts in the context you are given,
and when something is missing, say less rather than guess. Prefer short sentences and concrete next actions.
No preamble, no sign-off, no markdown headings unless the task asks for them.`;

export interface GuruResult {
  text: string;
  model: string;
  runId: string;
}

/** Free-text generation for briefings, drafts and reviews. Every call is stored in guru_runs. */
export async function generate(
  db: DB,
  kind: string,
  task: string,
  context: string,
  opts: { model?: string; maxTokens?: number } = {},
): Promise<GuruResult> {
  const model = opts.model ?? DRAFT_MODEL;
  const res = await anthropic().messages.create({
    model,
    max_tokens: opts.maxTokens ?? 4000,
    system: GURU_SYSTEM,
    messages: [{ role: "user", content: `<context>\n${context}\n</context>\n\n${task}` }],
  });
  if (res.stop_reason === "refusal") throw new Error("The model declined this request.");
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const run = db
    .insert(s.guruRuns)
    .values({
      kind,
      inputSummary: task.slice(0, 500),
      output: text,
      model,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    })
    .returning({ id: s.guruRuns.id })
    .get();
  return { text, model, runId: run.id };
}

/** Structured output (JSON validated against a Zod object schema). */
export async function generateObject<T extends z.ZodObject>(
  db: DB,
  kind: string,
  task: string,
  context: string,
  schema: T,
  opts: { model?: string; maxTokens?: number } = {},
): Promise<z.infer<T>> {
  const model = opts.model ?? FAST_MODEL;
  const res = await anthropic().messages.parse({
    model,
    max_tokens: opts.maxTokens ?? 2000,
    system: GURU_SYSTEM,
    messages: [{ role: "user", content: `<context>\n${context}\n</context>\n\n${task}` }],
    output_config: { format: zodOutputFormat(schema) },
  });
  if (res.stop_reason === "refusal") throw new Error("The model declined this request.");
  if (!res.parsed_output) throw new Error("The model returned output that did not match the schema.");
  db.insert(s.guruRuns)
    .values({
      kind,
      inputSummary: task.slice(0, 500),
      output: JSON.stringify(res.parsed_output),
      model,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    })
    .run();
  return res.parsed_output as z.infer<T>;
}
