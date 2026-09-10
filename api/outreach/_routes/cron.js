// Daily operations job (Vercel Cron -> vercel.json, 08:00 UTC). One pass:
//   1. poll the inbox — reconcile replies / bounces / auto-acks, classify replies
//   2. build the day's send queue from due enrollments (templates + AI drafts)
//   3. enrich a few un-researched prospects
//   4. email the digest
// Nothing is sent to prospects here — Luis approves the queued batch in /ops.
// Self-authenticated: Vercel sends "Authorization: Bearer $CRON_SECRET".

import { listProspects, updateResearch } from "../_lib/prospects.js";
import { pollReplies } from "../_lib/imap.js";
import { buildQueue } from "../_lib/queue.js";
import { enrichProspect, enrichSpec, aiEnabled, aiBackend } from "../_lib/ai.js";
import { enqueueJob } from "../_lib/jobs.js";
import { maybeSendDigest } from "../_lib/digest.js";
import { config as appConfig } from "../_lib/config.js";

const ENRICH_PER_RUN = 3;

export default async function handler(req, res) {
  const auth = req.headers.authorization || "";
  if (appConfig.cronSecret && auth !== `Bearer ${appConfig.cronSecret}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const out = { ok: true };
  try {
    out.poll = await pollReplies({ prospects: await listProspects() });
  } catch (err) {
    out.pollError = String(err.message || err);
  }

  try {
    out.queue = await buildQueue();
  } catch (err) {
    out.queueError = String(err.message || err);
  }

  try {
    if (aiEnabled()) {
      const need = (await listProspects()).filter(
        (p) => !p.research && !["unsubscribed", "bounced", "lost"].includes(p.status),
      );
      const done = [];
      for (const p of need.slice(0, ENRICH_PER_RUN)) {
        if (aiBackend() === "worker") {
          await enqueueJob(enrichSpec(p), { prospectId: p.id });
          done.push(p.id);
        } else {
          try {
            const r = await enrichProspect(p);
            if (r) {
              await updateResearch(p.id, r);
              done.push(p.id);
            }
          } catch {
            /* skip */
          }
        }
      }
      out.enriched = done;
    }
  } catch (err) {
    out.enrichError = String(err.message || err);
  }

  try {
    out.digest = await maybeSendDigest({ prospects: await listProspects() }, out.poll || { replies: [], bounces: [] });
  } catch (err) {
    out.digestError = String(err.message || err);
  }

  return res.json(out);
}
