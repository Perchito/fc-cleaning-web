// Send a bounded batch of approved emails. Called in a loop by the Queue
// review screen ("Send approved"), which spaces the calls out. Kept small so
// each invocation stays well under the function time limit.

import { sendApproved } from "../_lib/queue.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  const batch = Math.min(6, Math.max(1, Number(req.body?.batch) || 3));
  const jitterMs = req.body?.jitterMs != null ? Number(req.body.jitterMs) : undefined;
  try {
    const out = await sendApproved({ batch, jitterMs });
    return res.json({ ok: true, ...out });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
}
