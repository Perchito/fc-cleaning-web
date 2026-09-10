// AI job queue endpoint for the home Claude Code worker.
//   GET  /api/outreach/jobs            → claim up to N pending jobs (marks running)
//   GET  /api/outreach/jobs?id=<uuid>  → status of one job
//   POST /api/outreach/jobs            → { id, output } | { id, error }
// Auth: Authorization: Bearer $WORKER_SECRET. Sits in the middleware bypass.

import { claimJobs, completeJob, failJob, getJob, reapJobs } from "../_lib/jobs.js";

function authed(req) {
  const secret = process.env.WORKER_SECRET;
  if (!secret) return false;
  return (req.headers.authorization || "") === `Bearer ${secret}`;
}

export default async function handler(req, res) {
  // status check is allowed via the Basic-auth middleware (browser) OR bearer
  if (req.method === "GET" && req.query.id) {
    const job = await getJob(req.query.id);
    if (!job) return res.status(404).json({ error: "not found" });
    return res.json({ job });
  }

  if (!authed(req)) return res.status(401).json({ error: "unauthorized" });

  if (req.method === "GET") {
    try {
      await reapJobs();
    } catch {
      /* best effort */
    }
    const limit = Math.min(6, Math.max(1, Number(req.query.limit) || 4));
    return res.json({ jobs: await claimJobs(limit) });
  }

  if (req.method === "POST") {
    const { id, output, error } = req.body || {};
    if (!id) return res.status(400).json({ error: "id required" });
    if (error) return res.json(await failJob(id, error));
    return res.json(await completeJob(id, output ?? null));
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "method not allowed" });
}
