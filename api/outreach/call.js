import { load, save, getProspect, decorate, nowISO } from "./_lib/store.js";

const KEEP = ["replied", "won", "lost", "unsubscribed", "bounced"];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  const { id, note, outcome } = req.body || {};
  if (!id) return res.status(400).json({ error: "id required" });

  const db = await load();
  const p = getProspect(db, id);
  if (!p) return res.status(404).json({ error: "not found" });

  p.calls = p.calls || [];
  p.calls.push({
    at: nowISO(),
    note: String(note || "").slice(0, 500),
    outcome: outcome || null,
  });
  if (!KEEP.includes(p.status)) p.status = "awaiting_reply";
  p.updatedAt = nowISO();
  await save(db);
  return res.json({ ok: true, prospect: decorate(p) });
}
