import { getQueue, queueAction, buildQueue } from "../_lib/queue.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.json(await getQueue({ day: req.query.day }));
  }
  if (req.method === "POST") {
    const { action, ids, patch } = req.body || {};
    if (action === "build") {
      // manual trigger of the queue builder (also runs as a cron)
      return res.json({ ok: true, ...(await buildQueue()) });
    }
    if (!action) return res.status(400).json({ error: "action required" });
    const result = await queueAction({ action, ids, patch });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "method not allowed" });
}
