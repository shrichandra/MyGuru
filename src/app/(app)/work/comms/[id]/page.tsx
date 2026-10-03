import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb, schema as s } from "@/lib/db";
import { COMMS_TEMPLATES } from "@/lib/comms";
import { aiEnabled } from "@/lib/guru/client";
import { Field, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { deleteCommsDoc, saveCommsDoc } from "@/app/actions";
import { SparkIcon } from "@/components/Icons";

export default async function CommsDoc({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const doc = db.select().from(s.commsDocs).where(eq(s.commsDocs.id, id)).get();
  if (!doc) notFound();
  const t = COMMS_TEMPLATES[doc.kind];
  const projects = db.select().from(s.projects).orderBy(asc(s.projects.name)).all();

  return (
    <>
      <PageHeader eyebrow={t.name} title={doc.title} action={<Link href="/work#comms" className="text-sm font-semibold">Back</Link>} />
      <form action={saveCommsDoc} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={doc.id} />
        <div className="card flex flex-col gap-3 p-4">
          <Field label="Title">
            <input name="title" defaultValue={doc.title} className="input" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Linked project">
              <select name="projectId" defaultValue={doc.projectId ?? ""} className="input">
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Meeting time">
              <input name="meetingAt" type="datetime-local" defaultValue={doc.meetingAt ?? ""} className="input px-2" />
            </Field>
          </div>
          {t.fields.map((f) => (
            <Field key={f.key} label={f.label}>
              <textarea name={`field_${f.key}`} defaultValue={doc.fields[f.key] ?? ""} rows={3} className="textarea" />
            </Field>
          ))}
          <div className="flex flex-wrap gap-2">
            <SubmitButton className="btn-ghost" name="intent" value="save">
              Save notes
            </SubmitButton>
            <SubmitButton className="btn-primary" name="intent" value="draft" pendingText="Guru is drafting…">
              <SparkIcon size={18} /> {aiEnabled() ? "Draft with Guru" : "Build draft from template"}
            </SubmitButton>
          </div>
          {!aiEnabled() && <p className="text-xs text-muted">Guru AI is off (no API key), so the draft is your notes laid out in the template.</p>}
        </div>
        <div className="card flex flex-col gap-2 p-4">
          <span className="lbl">Draft</span>
          <textarea name="draft" defaultValue={doc.draft ?? ""} rows={14} className="textarea font-mono text-[13px]" placeholder="Your draft appears here. Edit freely, then Save notes." key={doc.updatedAt} />
        </div>
      </form>
      <form action={deleteCommsDoc}>
        <input type="hidden" name="id" value={doc.id} />
        <button className="btn-sm text-alert">Delete</button>
      </form>
    </>
  );
}
