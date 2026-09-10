// Single serverless entry for the whole outreach API. Vercel's Hobby plan caps
// a deployment at 12 functions, so every route lives in _routes/ and this
// dispatches to it by the first path segment:  /api/outreach/<segment>[/…]

import audit from "./_routes/audit.js";
import call from "./_routes/call.js";
import campaigns from "./_routes/campaigns.js";
import cron from "./_routes/cron.js";
import discover from "./_routes/discover.js";
import draft from "./_routes/draft.js";
import enrich from "./_routes/enrich.js";
import enroll from "./_routes/enroll.js";
import importCsv from "./_routes/import.js";
import migrate from "./_routes/migrate.js";
import poll from "./_routes/poll.js";
import preview from "./_routes/preview.js";
import prospects from "./_routes/prospects.js";
import queue from "./_routes/queue.js";
import replies from "./_routes/replies.js";
import send from "./_routes/send.js";
import sender from "./_routes/sender.js";
import stats from "./_routes/stats.js";
import status from "./_routes/status.js";
import templates from "./_routes/templates.js";

const ROUTES = {
  audit,
  call,
  campaigns,
  cron,
  discover,
  draft,
  enrich,
  enroll,
  import: importCsv,
  migrate,
  poll,
  preview,
  prospects,
  queue,
  replies,
  send,
  sender,
  stats,
  status,
  templates,
};

export default async function handler(req, res) {
  // Resolve the route segment. Prefer Vercel's parsed param, fall back to the
  // raw URL (the optional catch-all doesn't always populate req.query.path).
  const p = req.query?.path;
  let seg = Array.isArray(p) ? p[0] : typeof p === "string" ? p : "";
  if (!seg) {
    const m = String(req.url || "").match(/\/api\/outreach\/([^/?#]+)/);
    seg = m ? decodeURIComponent(m[1]) : "";
  }
  const route = ROUTES[seg];
  if (!route) {
    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(404).json({ error: `unknown outreach route: ${seg || "(none)"}` });
  }
  return route(req, res);
}
