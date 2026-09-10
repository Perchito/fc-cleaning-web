// Daily job (Vercel Cron -> see vercel.json). Polls the inbox and emails the
// digest. Vercel sends "Authorization: Bearer $CRON_SECRET" when CRON_SECRET
// is set; we require it so the endpoint can't be triggered by anyone.

import { listProspects } from "./_lib/prospects.js";
import { pollReplies } from "./_lib/imap.js";
import { maybeSendDigest } from "./_lib/digest.js";
import { config as appConfig } from "./_lib/config.js";

export default async function handler(req, res) {
  const auth = req.headers.authorization || "";
  if (appConfig.cronSecret && auth !== `Bearer ${appConfig.cronSecret}`) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    const result = await pollReplies({ prospects: await listProspects() });
    const digest = await maybeSendDigest({ prospects: await listProspects() }, result);
    return res.json({ ok: true, ...result, digest });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
}
