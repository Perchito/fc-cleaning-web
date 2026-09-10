// Re-check every "replied" prospect against the inbox and revert false
// positives (see auditReplies in _lib/imap.js). Behind the /ops Basic-auth
// middleware. POST to run it.

import { auditReplies } from "../_lib/imap.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  try {
    const out = await auditReplies();
    return res.json({ ok: true, ...out });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
}
