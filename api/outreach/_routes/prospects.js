import {
  listProspects,
  upsertProspect,
  getProspect,
  decorate,
  getMeta,
  prospectTimeline,
  getSends,
  setSendBody,
} from "../_lib/prospects.js";
import { listEnrollmentsForProspect } from "../_lib/campaigns.js";
import { fetchSentBodies } from "../_lib/imap.js";

export default async function handler(req, res) {
  if (req.method === "GET" && req.query.id) {
    const p = await getProspect(req.query.id);
    if (!p) return res.status(404).json({ error: "not found" });
    const [timeline, enrollments, sends] = await Promise.all([
      prospectTimeline(p.id),
      listEnrollmentsForProspect(p.id),
      getSends(p.id),
    ]);

    // Sends made before we stored the body (migrated from the old blob) have an
    // empty body — pull the real text from the Sent mailbox once, then cache it.
    // Strictly best-effort: never let a mailbox problem break the detail view.
    const missing = sends.filter((s) => !s.body && s.messageId).slice(0, 8);
    if (missing.length && req.query.bodies !== "0") {
      try {
        const bodies = await Promise.race([
          fetchSentBodies(missing.map((s) => s.messageId)),
          new Promise((resolve) => setTimeout(() => resolve(new Map()), 20_000)),
        ]);
        for (const s of missing) {
          const text = bodies.get(String(s.messageId).replace(/^<|>$/g, "").toLowerCase());
          if (text) {
            s.body = text;
            setSendBody(s.id, text).catch(() => {});
          }
        }
      } catch (e) {
        console.warn("[prospects] sent-body backfill failed:", String(e?.message || e));
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
