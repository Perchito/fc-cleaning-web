import { setStatus, decorate } from "../_lib/prospects.js";

const ALLOWED = ["awaiting_reply", "replied", "bounced", "won", "lost", "unsubscribed", "draft"];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  const { id, status, notes } = req.body || {};
  if (!id) return res.status(400).json({ error: "id required" });
  if (status && !ALLOWED.includes(status)) return res.status(400).json({ error: "bad status" });

  const p = await setStatus(id, {
    status: status ?? undefined,
    notes: typeof notes === "string" ? notes : undefined,
  });
  if (!p) return res.status(404).json({ error: "not found" });
  return res.json({ ok: true, prospect: decorate(p) });
}
