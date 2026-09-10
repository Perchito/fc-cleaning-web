// Research one prospect for AI drafting. Behind the /ops Basic-auth middleware.
// The daily batch enrichment runs inside cron.js.

import { getProspect, updateResearch } from "../_lib/prospects.js";
import { enrichProspect, aiEnabled } from "../_lib/ai.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  if (!aiEnabled())
    return res.status(409).json({ error: "AI is off — set OUTREACH_AI=on in Vercel to enable research" });
  const { prospectId } = req.body || {};
  if (!prospectId) return res.status(400).json({ error: "prospectId required" });
  const p = await getProspect(prospectId);
  if (!p) return res.status(404).json({ error: "not found" });
  try {
    const out = await enrichProspect(p);
    if (!out) return res.status(502).json({ error: "research failed" });
    const updated = await updateResearch(prospectId, out);
    return res.json({ ok: true, prospect: updated });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
}
