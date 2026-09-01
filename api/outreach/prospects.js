import { load, save, decorate, upsertProspect } from "./_lib/store.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const db = await load();
    const prospects = db.prospects.map(decorate).sort((a, b) => {
      const rank = (s) =>
        ({ replied: 0, follow_up_due: 1, awaiting_reply: 2, draft: 3, bounced: 4 })[s] ?? 5;
      if (rank(a.effectiveStatus) !== rank(b.effectiveStatus))
        return rank(a.effectiveStatus) - rank(b.effectiveStatus);
      return (b.lastSendAt || "").localeCompare(a.lastSendAt || "");
    });
    const counts = {};
    for (const p of prospects) counts[p.effectiveStatus] = (counts[p.effectiveStatus] || 0) + 1;
    return res.json({ prospects, counts, total: prospects.length, lastPollAt: db.lastPollAt || null });
  }

  if (req.method === "POST") {
    const { business, email } = req.body || {};
    if (!business || !email) return res.status(400).json({ error: "business and email required" });
    const db = await load();
    const p = upsertProspect(db, req.body);
    await save(db);
    return res.json({ ok: true, prospect: decorate(p) });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "method not allowed" });
}
