export type CommsKind = "meeting_prep" | "exec_update" | "scqa" | "pyramid";

export const COMMS_TEMPLATES: Record<
  CommsKind,
  { name: string; useFor: string; fields: { key: string; label: string }[]; prompt: string }
> = {
  meeting_prep: {
    name: "Meeting prep",
    useFor: "Any meeting you own or contribute to",
    fields: [
      { key: "goal", label: "Goal of the meeting" },
      { key: "needs", label: "What I need from whom" },
      { key: "points", label: "My 3 points" },
      { key: "objections", label: "Likely objections" },
      { key: "decision", label: "Decision asked for" },
    ],
    prompt:
      "Turn my notes into a one-page meeting prep with those five sections as short labelled blocks. Sharpen my 3 points, add a one-line answer under each likely objection, and end with the exact sentence I should use to ask for the decision.",
  },
  exec_update: {
    name: "Executive update (BLUF)",
    useFor: "Weekly or ad-hoc status to leadership",
    fields: [
      { key: "bottom_line", label: "Bottom line" },
      { key: "progress", label: "Progress vs plan" },
      { key: "risks", label: "Risks and asks" },
      { key: "next", label: "Next milestones" },
    ],
    prompt:
      "Write an executive update in BLUF style from my notes and the linked tasks: bottom line first in one or two sentences, then progress vs plan, risks and asks (each ask names who and by when), and next milestones. Under 200 words, plain and confident.",
  },
  scqa: {
    name: "SCQA pitch",
    useFor: "Pitching an idea or a proposal",
    fields: [
      { key: "situation", label: "Situation" },
      { key: "complication", label: "Complication" },
      { key: "question", label: "Question" },
      { key: "answer", label: "Answer" },
    ],
    prompt:
      "Write a tight SCQA pitch from my notes: one short paragraph each for Situation, Complication, Question and Answer, then a one-line call to action.",
  },
  pyramid: {
    name: "Pyramid answer",
    useFor: "Answering a question on the spot",
    fields: [
      { key: "question", label: "The question" },
      { key: "answer", label: "My answer" },
      { key: "reasons", label: "Supporting reasons" },
      { key: "evidence", label: "Evidence" },
    ],
    prompt:
      "Write a pyramid-principle answer: the answer in one sentence first, then exactly 3 supporting reasons, each with one line of evidence. Make it sayable out loud in under a minute.",
  },
};
