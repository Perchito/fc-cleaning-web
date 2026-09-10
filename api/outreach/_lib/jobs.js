// ai_jobs queue — the bridge between the site and the home Claude Code worker.
// The site enqueues a prompt spec + a `ref` telling us where the answer goes;
// the worker runs it and posts back; completeJob() applies the result.

import { sql } from "./db.js";
import { updateResearch, getProspect } from "./prospects.js";
import { upsertProspect } from "./prospects.js";
import { normDraft, normClassify, normEnrich } from "./ai.js";

/** Enqueue a job. `spec` is a prompt spec from ai.js; `ref` locates the target row. */
export async function enqueueJob(spec, ref = {}) {
  const input = {
    system: spec.system,
    prompt: spec.prompt,
    web: !!spec.web,
    expect: spec.expect || "json",
    ref,
  };
  const rows = await sql`
    insert into ai_jobs (kind, input) values (${spec.kind}, ${JSON.stringify(input)}::jsonb)
    returning id`;
  return rows[0].id;
}

/** Atomically hand `limit` pending jobs to the worker. */
export async function claimJobs(limit = 4) {
  const rows = await sql`
    update ai_jobs set status = 'running', claimed_at = now(), attempts = attempts + 1
    where id in (
      select id from ai_jobs where status = 'pending'
      order by created_at limit ${limit} for update skip locked
    )
    returning id, kind, input`;
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    system: r.input.system,
    prompt: r.input.prompt,
    web: r.input.web,
    expect: r.input.expect,
  }));
}

export async function getJob(id) {
  const rows = await sql`select id, kind, status, error, finished_at from ai_jobs where id = ${id}`;
  return rows[0] || null;
}

export async function failJob(id, error) {
  const [job] = await sql`select kind, input from ai_jobs where id = ${id}`;
  await sql`
    update ai_jobs set status = 'failed', error = ${String(error).slice(0, 2000)}, finished_at = now()
    where id = ${id}`;
  if (job) await clearPending(job.kind, job.input?.ref || {});
  return { ok: true };
}

export async function completeJob(id, output) {
  const [job] = await sql`select kind, input from ai_jobs where id = ${id}`;
  if (!job) return { error: "not found" };
  await sql`
    update ai_jobs set status = 'done', output = ${JSON.stringify(output ?? null)}::jsonb,
      error = null, finished_at = now()
    where id = ${id}`;
  try {
    await applyResult(job.kind, job.input?.ref || {}, output);
  } catch (e) {
    await sql`update ai_jobs set error = ${"apply: " + String(e?.message || e)} where id = ${id}`;
  }
  return { ok: true };
}

async function clearPending(kind, ref) {
  if (kind === "draft" && ref.sendId)
    await sql`update sends set ai_pending = false where id = ${ref.sendId}`;
  if (kind === "classify" && ref.eventId)
    await sql`update events set ai_pending = false where id = ${ref.eventId}`;
}

// ─────────────────────────────── apply results ───────────────────────────────

async function applyResult(kind, ref, output) {
  if (kind === "draft") {
    if (!ref.sendId) return;
    const p = await getProspect(ref.prospectId);
    const d = normDraft(output, p || { business: "" });
    if (d) {
      await sql`
        update sends set subject = ${d.subject}, body = ${d.body},
          ai_generated = true, ai_pending = false
        where id = ${ref.sendId} and status = 'queued'`;
    } else {
      await sql`update sends set ai_pending = false where id = ${ref.sendId}`;
    }
    return;
  }

  if (kind === "classify") {
    if (!ref.eventId) return;
    const a = normClassify(output);
    await sql`
      update events set intent = ${a.intent}, ai_pending = false,
        meta = meta || ${JSON.stringify({
          confidence: a.confidence,
          summary: a.summary,
          suggested_reply: a.suggestedReply,
        })}::jsonb
      where id = ${ref.eventId}`;
    if (a.intent === "unsubscribe" && ref.prospectId) {
      await sql`update prospects set status = 'unsubscribed', updated_at = now() where id = ${ref.prospectId}`;
      await sql`insert into suppression (email, reason)
        select email, 'unsubscribe reply' from prospects where id = ${ref.prospectId}
        on conflict (email) do nothing`;
    }
    return;
  }

  if (kind === "enrich") {
    if (!ref.prospectId) return;
    const e = normEnrich(output);
    if (e) await updateResearch(ref.prospectId, e);
    return;
  }

  if (kind === "discover") {
    const leads = Array.isArray(output?.leads) ? output.leads : [];
    const added = [];
    for (const lead of leads) {
      if (!lead?.business || !lead?.email) continue;
      const p = await upsertProspect({ ...lead, source: "ai-research (worker)" });
      added.push(p.id);
    }
    // If a campaign was chosen in "Find leads", enrol the new ones and build
    // their first emails now (dynamic imports avoid a queue<->jobs import cycle).
    if (ref.campaignId && added.length) {
      const { enrollProspects } = await import("./campaigns.js");
      await enrollProspects(ref.campaignId, added).catch(() => {});
      const { buildQueue } = await import("./queue.js");
      await buildQueue().catch(() => {});
    }
    return;
  }
}

/** Housekeeping: re-open jobs stuck 'running' for too long; drop ancient rows. */
export async function reapJobs() {
  await sql`
    update ai_jobs set status = 'pending', claimed_at = null
    where status = 'running' and claimed_at < now() - interval '10 minutes' and attempts < 3`;
  await sql`
    update ai_jobs set status = 'failed', error = 'gave up after 3 attempts'
    where status = 'running' and claimed_at < now() - interval '10 minutes' and attempts >= 3`;
  await sql`delete from ai_jobs where status in ('done','failed') and finished_at < now() - interval '7 days'`;
}
