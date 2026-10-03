import Link from "next/link";
import { asc, desc, isNotNull } from "drizzle-orm";
import { getDb, schema as s } from "@/lib/db";
import { calendarFor, sprintFor } from "@/lib/data";
import { formatDate, today } from "@/lib/time";
import { COMMS_TEMPLATES, type CommsKind } from "@/lib/comms";
import { Details, Empty, PageHeader, Row, Section } from "@/components/ui";
import { TaskRow } from "@/components/TaskRow";
import { SubmitButton } from "@/components/SubmitButton";
import { createCommsDoc, createProject, createTask, deleteTask, setProjectStatus } from "@/app/actions";

export default async function Work({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project: projectFilter } = await searchParams;
  const db = getDb();
  const date = today();
  const sprint = sprintFor(db, date);
  const sprintIds = new Set(sprint.map((t) => t.id));
  const projects = db.select().from(s.projects).orderBy(asc(s.projects.status), asc(s.projects.name)).all();
  const all = db.select().from(s.tasks).orderBy(asc(s.tasks.sort)).all();
  const subtasksOf = (id: string) => all.filter((t) => t.parentId === id);
  const top = all.filter((t) => !t.parentId && (!projectFilter || t.projectId === projectFilter));
  const open = top.filter((t) => t.status !== "done" && !sprintIds.has(t.id));
  const doneRecent = top.filter((t) => t.status === "done").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")).slice(0, 5);
  const docs = db.select().from(s.commsDocs).orderBy(desc(s.commsDocs.updatedAt)).limit(10).all();
  const meetings = calendarFor(db, date).filter((e) => !e.allDay);
  const prepped = new Set(db.select({ m: s.commsDocs.meetingAt }).from(s.commsDocs).where(isNotNull(s.commsDocs.meetingAt)).all().map((r) => r.m));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  return (
    <>
      <PageHeader eyebrow={formatDate(date)} title="Work" />

      <Section title={`Today's top 3 · ${sprint.filter((t) => t.status === "done").length}/${sprint.length || 3} done`}>
        <div className="card flex flex-col">
          {sprint.length === 0 && <Empty>Tap &ldquo;Top 3&rdquo; on up to three tasks below.</Empty>}
          {sprint.map((t) => (
            <TaskRow key={t.id} task={t} inSprint subtasks={subtasksOf(t.id)} />
          ))}
        </div>
      </Section>

      {meetings.length > 0 && (
        <Section title="Meetings today">
          <div className="card flex flex-col">
            {meetings.map((m) => (
              <div key={m.id} className="flex items-center gap-3 border-b border-soft px-4 py-2 last:border-0">
                <span className="num w-11 text-sm font-semibold">{m.startAt.slice(11, 16)}</span>
                <span className="flex-1 text-sm">{m.title}</span>
                {prepped.has(m.startAt) ? (
                  <span className="chip bg-work-soft text-work">Prep ready</span>
                ) : (
                  <form action={createCommsDoc}>
                    <input type="hidden" name="kind" value="meeting_prep" />
                    <input type="hidden" name="title" value={m.title} />
                    <input type="hidden" name="meetingAt" value={m.startAt} />
                    <SubmitButton className="btn-sm bg-soft text-ink">Prep</SubmitButton>
                  </form>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section
        title={projectFilter ? `Tasks · ${projectName.get(projectFilter) ?? ""}` : sprint.length ? "Other open tasks" : "Open tasks"}
        action={projectFilter ? <Link href="/work" className="text-xs font-semibold">Show all</Link> : undefined}
      >
        <div className="card flex flex-col">
          {open.length === 0 && <Empty>No other open tasks. Add one below or with + Log (&ldquo;todo: …&rdquo;).</Empty>}
          {open.map((t) => (
            <div key={t.id} className="relative">
              {t.projectId && !projectFilter && <span className="absolute top-1 right-4 text-[10px] text-faint">{projectName.get(t.projectId)}</span>}
              <TaskRow task={t} inSprint={sprintIds.has(t.id)} subtasks={subtasksOf(t.id)} />
            </div>
          ))}
        </div>
        <form action={createTask} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_160px_140px_auto]">
          <input name="title" className="input" placeholder="New task" required aria-label="New task" />
          <select name="projectId" className="input hidden sm:block" defaultValue={projectFilter ?? ""} aria-label="Project">
            <option value="">No project</option>
            {projects.filter((p) => p.status === "active").map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input name="dueDate" type="date" className="input hidden sm:block" aria-label="Due date" />
          <SubmitButton className="btn-ghost">Add</SubmitButton>
        </form>
        {doneRecent.length > 0 && (
          <Details summary="Recently done">
            <ul className="flex flex-col gap-1 text-sm text-muted">
              {doneRecent.map((t) => (
                <li key={t.id} className="flex items-center justify-between">
                  <span className="line-through">{t.title}</span>
                  <form action={deleteTask}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="btn-sm text-faint" aria-label="Delete task">×</button>
                  </form>
                </li>
              ))}
            </ul>
          </Details>
        )}
      </Section>

      <Section title="Projects">
        <div className="card flex flex-col">
          {projects.length === 0 && <Empty>No projects yet.</Empty>}
          {projects.map((p) => {
            const ts = all.filter((t) => t.projectId === p.id && !t.parentId);
            const done = ts.filter((t) => t.status === "done").length;
            return (
              <div key={p.id} className="flex items-center gap-3 border-b border-soft px-4 py-2 last:border-0">
                <Link href={`/work?project=${p.id}`} className="flex flex-1 flex-col text-ink no-underline">
                  <span className="text-sm font-semibold">{p.name}</span>
                  <span className="text-xs text-muted">
                    {done}/{ts.length} done{p.description ? ` · ${p.description}` : ""}
                  </span>
                </Link>
                <form action={setProjectStatus}>
                  <input type="hidden" name="id" value={p.id} />
                  <select name="status" defaultValue={p.status} className="h-9 rounded-lg border border-line bg-white px-2 text-xs" aria-label={`Status of ${p.name}`}>
                    <option value="active">active</option>
                    <option value="paused">paused</option>
                    <option value="done">done</option>
                  </select>
                  <SubmitButton className="btn-sm ml-1 bg-soft text-ink">Set</SubmitButton>
                </form>
              </div>
            );
          })}
        </div>
        <Details summary="New project">
          <form action={createProject} className="flex flex-col gap-2">
            <input name="name" className="input" placeholder="Project name" required aria-label="Project name" />
            <input name="description" className="input" placeholder="One-line description" aria-label="Description" />
            <SubmitButton>Create project</SubmitButton>
          </form>
        </Details>
      </Section>

      <Section title="Communication" className="scroll-mt-4" >
        <div id="comms" className="card flex flex-col">
          {docs.length === 0 && <Empty>No drafts yet. Start from a template below.</Empty>}
          {docs.map((d) => (
            <Row key={d.id} href={`/work/comms/${d.id}`}>
              <span className="chip shrink-0 whitespace-nowrap bg-work-soft text-work">{COMMS_TEMPLATES[d.kind].name.replace(" (BLUF)", "")}</span>
              <span className="flex-1 text-sm">{d.title}</span>
              {d.draft && <span className="text-xs text-teal">drafted</span>}
            </Row>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(COMMS_TEMPLATES) as CommsKind[]).map((k) => (
            <form key={k} action={createCommsDoc}>
              <input type="hidden" name="kind" value={k} />
              {projectFilter && <input type="hidden" name="projectId" value={projectFilter} />}
              <button className="card flex h-full w-full cursor-pointer flex-col items-start gap-0.5 p-3 text-left hover:bg-ground">
                <span className="text-sm font-semibold">{COMMS_TEMPLATES[k].name}</span>
                <span className="text-xs text-muted">{COMMS_TEMPLATES[k].useFor}</span>
              </button>
            </form>
          ))}
        </div>
      </Section>
    </>
  );
}
