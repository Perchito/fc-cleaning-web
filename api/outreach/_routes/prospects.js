import {
  listProspects,
  upsertProspect,
  getProspect,
  decorate,
  getMeta,
  prospectTimeline,
  getSends,
} from "../_lib/prospects.js";
import { listEnrollmentsForProspect } from "../_lib/campaigns.js";
import { sql } from "../_lib/db.js";
import { render, withFooter } from "../_lib/render.js";

export default async function handler(req, res) {
  if (req.method === "GET" && req.query.id) {
    const p = await getProspect(req.query.id);
    if (!p) return res.status(404).json({ error: "not found" });
    const [timeline, enrollments, sends] = await Promise.all([
      prospectTimeline(p.id),
      listEnrollmentsForProspect(p.id),
      getSends(p.id),
    ]);

    // New sends store the body verbatim. Sends from before the rebuild have an
    // empty body and no copy anywhere (iCloud doesn't file SMTP-sent mail into
    // the Sent folder) — reconstruct them from the campaign step template.
    const stillMissing = sends.filter((s) => !s.body);
    if (stillMissing.length) {
      const rows = await sql`
        select s.id as send_id, cs.subject_tmpl, cs.body_tmpl
        from sends s
        join campaign_steps cs
          on cs.campaign_id = s.campaign_id and cs.step_index = s.step_index
        where s.id = any(${stillMissing.map((s) => s.id)})`;
      const tmplBy = Object.fromEntries(rows.map((r) => [r.send_id, r]));
      for (const s of stillMissing) {
        const t = tmplBy[s.id];
        if (t?.body_tmpl) {
          s.body = withFooter(render(t.body_tmpl, p), p);
          s.reconstructed = true;
        }
      }
    }

    return res.json({ prospect: decorate(p), timeline, enrollments, sends });
  }

  if (req.method === "GET") {
    const prospects = (await listProspects()).map(decorate).sort((a, b) => {
      const rank = (s) =>
        ({ replied: 0, follow_up_due: 1, awaiting_reply: 2, draft: 3, bounced: 4 })[s] ?? 5;
      if (rank(a.effectiveStatus) !== rank(b.effectiveStatus))
        return rank(a.effectiveStatus) - rank(b.effectiveStatus);
      return (b.lastSendAt || "").localeCompare(a.lastSendAt || "");
    });
    const counts = {};
    for (const p of prospects) counts[p.effectiveStatus] = (counts[p.effectiveStatus] || 0) + 1;
    const lastPollAt = await getMeta("lastPollAt");
    return res.json({ prospects, counts, total: prospects.length, lastPollAt });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const existing = body.id && (await getProspect(body.id));
    if (!existing && (!body.business || !body.email))
      return res.status(400).json({ error: "business and email required" });
    const p = await upsertProspect(body);
    return res.json({ ok: true, prospect: decorate(p) });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "method not allowed" });
}
