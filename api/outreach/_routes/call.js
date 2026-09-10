import { logCall, decorate } from "../_lib/prospects.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  const { id, note, outcome } = req.body || {};
  if (!id) return res.status(400).json({ error: "id required" });

  const p = await logCall(id, { note, outcome });
  if (!p) return res.status(404).json({ error: "not found" });
  return res.json({ ok: true, prospect: decorate(p) });
}
