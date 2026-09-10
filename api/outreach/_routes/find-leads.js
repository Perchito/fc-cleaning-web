// "Find leads" — kicks off AI lead discovery on demand from /ops. Behind the
// Basic-auth middleware. Enqueues a discover job for the home worker.

import { listProspects } from "../_lib/prospects.js";
import { aiEnabled, aiBackend, discoverSpec } from "../_lib/ai.js";
import { enqueueJob } from "../_lib/jobs.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  if (!aiEnabled()) return res.status(409).json({ error: "AI is off (OUTREACH_AI)" });
  if (aiBackend() !== "worker")
    return res.status(409).json({ error: "Lead search runs on the home worker (AI_BACKEND=worker)" });

  const area = (req.body?.area || "Bolton and the North West").toString().slice(0, 200);
  const count = Math.min(8, Math.max(1, Number(req.body?.count) || 3));
  const existingNames = (await listProspects()).map((p) => p.business);

  const jobId = await enqueueJob(discoverSpec({ area, count, existingNames }), {});
  return res.json({ ok: true, pending: true, jobId, area, count });
}
