// Reusable template library (subject + body with merge tokens). Separate from
// _lib/templates.js, which is the legacy one-off draft generator.

import { sql } from "./_lib/db.js";

const row = (r) => ({
  id: r.id,
  name: r.name,
  subjectTmpl: r.subject_tmpl,
  bodyTmpl: r.body_tmpl,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export default async function handler(req, res) {
  const id = req.query.id;

  if (req.method === "GET") {
    const rows = await sql`select * from templates order by updated_at desc`;
    return res.json({ templates: rows.map(row) });
  }

  if (req.method === "POST") {
    const { name, subjectTmpl, bodyTmpl } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });
    const rows = await sql`
      insert into templates (name, subject_tmpl, body_tmpl)
      values (${name}, ${subjectTmpl || ""}, ${bodyTmpl || ""})
      returning *`;
    return res.json({ ok: true, template: row(rows[0]) });
  }

  if (req.method === "PATCH") {
    if (!id) return res.status(400).json({ error: "id required" });
    const { name, subjectTmpl, bodyTmpl } = req.body || {};
    const rows = await sql`
      update templates set
        name = coalesce(${name ?? null}, name),
        subject_tmpl = coalesce(${subjectTmpl ?? null}, subject_tmpl),
        body_tmpl = coalesce(${bodyTmpl ?? null}, body_tmpl),
        updated_at = now()
      where id = ${id}
      returning *`;
    if (!rows[0]) return res.status(404).json({ error: "not found" });
    return res.json({ ok: true, template: row(rows[0]) });
  }

  if (req.method === "DELETE") {
    if (!id) return res.status(400).json({ error: "id required" });
    await sql`delete from templates where id = ${id}`;
    return res.json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ error: "method not allowed" });
}
