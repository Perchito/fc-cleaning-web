// The send engine: build the day's queue from due enrollments, the review
// screen, and sending the approved batch.

import { sql } from "./db.js";
import { getProspect, nowISO } from "./prospects.js";
import { render, validate, withFooter } from "./render.js";
import { draftEmail, aiEnabled, aiBackend, draftSpec, normDraft } from "./ai.js";
import { runViaApi } from "./ai.js";
import { enqueueJob } from "./jobs.js";
import { sendMail } from "./mailer.js";
import { suppressedSet } from "./suppression.js";

const londonToday = () =>
  new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/London" }))
    .toISOString()
    .slice(0, 10);

// ─────────────────────────────── A/B ───────────────────────────────

/** Which variant the next send at this step should use. Locks to a winner once
 *  both variants clear the campaign's ab_min_sends threshold. */
async function pickVariant(step, campaign) {
  if (!step.ab_enabled) return "A";
  const rows = await sql`
    select s.variant_key,
           count(*) filter (where s.status = 'sent')                          as sent,
           count(distinct ev.prospect_id) filter (where ev.type = 'reply')    as replies
    from sends s
    left join events ev on ev.prospect_id = s.prospect_id and ev.type = 'reply'
                        and ev.at >= s.sent_at
    where s.step_id = ${step.id} and s.variant_key is not null
    group by s.variant_key`;
  const by = Object.fromEntries(rows.map((r) => [r.variant_key, r]));
  const a = by.A || { sent: 0, replies: 0 };
  const b = by.B || { sent: 0, replies: 0 };
  const min = campaign.ab_min_sends ?? 8;
  if (Number(a.sent) >= min && Number(b.sent) >= min) {
    const ra = a.sent ? a.replies / a.sent : 0;
    const rb = b.sent ? b.replies / b.sent : 0;
    return rb > ra ? "B" : "A";
  }
  // still testing — send to whichever has fewer so far
  return Number(a.sent) + Number(a.replies) <= Number(b.sent) + Number(b.replies) ? "A" : "B";
}

// ─────────────────────────────── build ───────────────────────────────

const MAX_AI_DRAFTS_PER_BUILD = 12; // keep the cron under its time budget

export async function buildQueue() {
  const today = londonToday();
  const campaigns = await sql`select * from campaigns where status = 'active'`;
  const summary = { day: today, queued: 0, aiDrafts: 0, byCampaign: {}, skipped: [] };
  let aiBudget = MAX_AI_DRAFTS_PER_BUILD;

  for (const c of campaigns) {
    // how many more can go out for this campaign today
    const [{ n: usedToday }] = await sql`
      select count(*)::int as n from sends
      where campaign_id = ${c.id}
        and (queued_for = ${today} or (status = 'sent' and sent_at::date = ${today}))`;
    let budget = Math.max(0, (c.daily_cap ?? 25) - usedToday);
    if (!budget) continue;

    const due = await sql`
      select e.*, p.email, p.status as prospect_status
      from enrollments e
      join prospects p on p.id = e.prospect_id
      where e.campaign_id = ${c.id} and e.status = 'active'
        and e.next_due_at is not null and e.next_due_at <= now()
        and p.status not in ('unsubscribed','bounced','won','lost')
      order by e.next_due_at asc`;
    if (!due.length) continue;

    const suppressed = await suppressedSet(due.map((d) => d.email));
    const steps = await sql`
      select * from campaign_steps where campaign_id = ${c.id} and active = true order by step_index`;
    const stepByIndex = Object.fromEntries(steps.map((s) => [s.step_index, s]));

    for (const e of due) {
      if (budget <= 0) break;
      if (suppressed.has(e.email.toLowerCase())) {
        await sql`update enrollments set status='stopped', stopped_reason='suppressed', updated_at=now() where id=${e.id}`;
        summary.skipped.push({ prospectId: e.prospect_id, reason: "suppressed" });
        continue;
      }

      const step = stepByIndex[e.current_step];
      if (!step) {
        await sql`update enrollments set status='completed', updated_at=now() where id=${e.id}`;
        continue;
      }

      // global guard: never two emails to one prospect inside 48h
      const [{ recent }] = await sql`
        select count(*)::int as recent from sends
        where prospect_id = ${e.prospect_id}
          and (queued_for = ${today}
               or (status='sent' and sent_at > now() - interval '48 hours'))`;
      if (recent > 0) {
        summary.skipped.push({ prospectId: e.prospect_id, reason: "contacted <48h ago" });
        continue;
      }
      // already queued this step?
      const [{ dup }] = await sql`
        select count(*)::int as dup from sends
        where enrollment_id = ${e.id} and step_index = ${e.current_step}
          and status in ('queued','approved')`;
      if (dup > 0) continue;

      const p = await getProspect(e.prospect_id);
      const round = e.current_step + 1;
      const variant = await pickVariant(step, c);

      // Always render the template first — it's the fallback that guarantees
      // the queue is never blocked waiting on AI.
      const subjTmpl = variant === "B" && step.subject_tmpl_b ? step.subject_tmpl_b : step.subject_tmpl;
      const bodyTmpl = variant === "B" && step.body_tmpl_b ? step.body_tmpl_b : step.body_tmpl;
      let subject = render(subjTmpl || `Cleaning for {{business}}`, p);
      let body = withFooter(render(bodyTmpl || "", p), p);
      let aiGenerated = false;
      let aiPending = false;
      const wantAI = step.mode === "ai" && aiEnabled();

      if (wantAI && aiBackend() === "api") {
        if (aiBudget <= 0) {
          summary.skipped.push({ prospectId: e.prospect_id, reason: "AI draft budget — will retry next run" });
          continue;
        }
        aiBudget--;
        try {
          const d = normDraft(await runViaApi(draftSpec(p, { aiGuidance: step.ai_guidance }, { round })), p);
          if (d) {
            subject = d.subject;
            body = d.body;
            aiGenerated = true;
            summary.aiDrafts++;
          }
        } catch {
          /* keep the template */
        }
      } else if (wantAI && aiBackend() === "worker") {
        aiPending = true;
      }

      // threading off the prospect's last send
      const prev = (
        await sql`select message_id from sends where prospect_id = ${e.prospect_id}
                 and status='sent' and message_id is not null order by sent_at desc`
      );
      const inReplyTo = prev[0]?.message_id || null;
      const refs = prev.map((r) => r.message_id).reverse().join(" ") || null;

      const [ins] = await sql`
        insert into sends
          (enrollment_id, prospect_id, campaign_id, step_id, step_index, variant_key,
           ai_generated, ai_pending, subject, body, status, in_reply_to, thread_refs, queued_for)
        values (
          ${e.id}, ${e.prospect_id}, ${c.id}, ${step.id}, ${e.current_step},
          ${step.ab_enabled ? variant : null}, ${aiGenerated}, ${aiPending}, ${subject}, ${body},
          'queued', ${inReplyTo}, ${refs}, ${today}
        )
        returning id`;

      if (aiPending) {
        await enqueueJob(draftSpec(p, { aiGuidance: step.ai_guidance }, { round }), {
          sendId: ins.id,
          prospectId: e.prospect_id,
        });
        summary.aiDrafts++;
      }

      budget--;
      summary.queued++;
      summary.byCampaign[c.name] = (summary.byCampaign[c.name] || 0) + 1;
    }
  }
  await sql`
    insert into meta (k, v) values ('lastQueueBuildAt', ${JSON.stringify(nowISO())}::jsonb)
    on conflict (k) do update set v = excluded.v`;
  return summary;
}

// ─────────────────────────────── review ───────────────────────────────

export async function getQueue({ day } = {}) {
  const d = day || londonToday();
  const rows = await sql`
    select s.*, p.business, p.email, p.contact_name, c.name as campaign_name
    from sends s
    join prospects p on p.id = s.prospect_id
    left join campaigns c on c.id = s.campaign_id
    where s.queued_for = ${d} and s.status in ('queued','approved','failed')
    order by c.name, s.queued_at`;

  const items = rows.map((r) => ({
    id: r.id,
    prospectId: r.prospect_id,
    business: r.business,
    email: r.email,
    contactName: r.contact_name,
    campaignId: r.campaign_id,
    campaignName: r.campaign_name,
    stepIndex: r.step_index,
    variantKey: r.variant_key,
    aiGenerated: r.ai_generated,
    aiPending: r.ai_pending,
    subject: r.subject,
    body: r.body,
    status: r.status,
    error: r.error,
    unresolved: [...new Set([...validate(r.subject), ...validate(r.body)])],
    queuedAt: r.queued_at,
  }));

  const counts = {
    total: items.length,
    queued: items.filter((i) => i.status === "queued").length,
    approved: items.filter((i) => i.status === "approved").length,
    failed: items.filter((i) => i.status === "failed").length,
    blocked: items.filter((i) => i.unresolved.length).length,
  };
  return { day: d, items, counts };
}

// ─────────────────────────────── review actions ───────────────────────────────

async function advancePastStep(sendId) {
  const [s] = await sql`select enrollment_id, step_index from sends where id = ${sendId}`;
  if (!s?.enrollment_id) return;
  const [nextStep] = await sql`
    select wait_days from campaign_steps
    where campaign_id = (select campaign_id from enrollments where id = ${s.enrollment_id})
      and active = true and step_index = ${s.step_index + 1}`;
  if (nextStep) {
    await sql`
      update enrollments
        set current_step = ${s.step_index + 1},
            next_due_at = now() + make_interval(days => ${nextStep.wait_days}),
            updated_at = now()
      where id = ${s.enrollment_id}`;
  } else {
    await sql`update enrollments set status='completed', updated_at=now() where id=${s.enrollment_id}`;
  }
}

export async function queueAction({ action, ids = [], patch = {} }) {
  if (action === "approve" || action === "approve_all") {
    const day = londonToday();
    if (action === "approve_all") {
      await sql`update sends set status='approved', approved_at=now()
               where queued_for=${day} and status='queued' and ai_pending = false
                 and not exists (select 1 from suppression x where x.email =
                   (select email from prospects p where p.id = sends.prospect_id))`;
    } else {
      await sql`update sends set status='approved', approved_at=now()
               where id = any(${ids}) and status='queued'`;
    }
    return { ok: true };
  }
  if (action === "unapprove") {
    await sql`update sends set status='queued', approved_at=null where id = any(${ids}) and status='approved'`;
    return { ok: true };
  }
  if (action === "retry") {
    await sql`update sends set status='approved', approved_at=now(), error=null where id = any(${ids}) and status='failed'`;
    return { ok: true };
  }
  if (action === "edit") {
    const { subject, body } = patch;
    await sql`
      update sends set
        subject = coalesce(${subject ?? null}, subject),
        body = coalesce(${body ?? null}, body)
      where id = ${ids[0]}`;
    return { ok: true };
  }
  if (action === "skip") {
    for (const id of ids) {
      await sql`update sends set status='skipped' where id=${id}`;
      await advancePastStep(id);
    }
    return { ok: true };
  }
  if (action === "snooze") {
    for (const id of ids) {
      const [s] = await sql`select enrollment_id from sends where id=${id}`;
      await sql`delete from sends where id=${id}`;
      if (s?.enrollment_id)
        await sql`update enrollments set next_due_at = now() + interval '1 day', updated_at=now()
                 where id=${s.enrollment_id}`;
    }
    return { ok: true };
  }
  return { error: "unknown action" };
}

// ─────────────────────────────── send ───────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function sendApproved({ batch = 3, jitterMs } = {}) {
  const rows = await sql`
    select s.*, p.email, p.business
    from sends s join prospects p on p.id = s.prospect_id
    where s.status = 'approved'
    order by s.approved_at asc
    limit ${batch}`;

  const suppressed = await suppressedSet(rows.map((r) => r.email));
  const results = [];

  for (let i = 0; i < rows.length; i++) {
    const s = rows[i];
    if (suppressed.has(s.email.toLowerCase())) {
      await sql`update sends set status='skipped', error='suppressed' where id=${s.id}`;
      results.push({ id: s.id, business: s.business, skipped: "suppressed" });
      continue;
    }
    try {
      const headers = {};
      if (s.in_reply_to) headers["In-Reply-To"] = s.in_reply_to;
      if (s.thread_refs) headers["References"] = s.thread_refs;

      const info = await sendMail({ to: s.email, subject: s.subject, text: s.body, headers });
      await sql`
        update sends set status='sent', message_id=${info.messageId}, sent_at=now(), error=null
        where id=${s.id}`;
      await sql`
        insert into events (prospect_id, campaign_id, enrollment_id, type, subject, message_id)
        values (${s.prospect_id}, ${s.campaign_id}, ${s.enrollment_id}, 'sent', ${s.subject}, ${info.messageId})`;
      await sql`
        update prospects set status='awaiting_reply',
          followups_sent = followups_sent + ${s.step_index >= 1 ? 1 : 0}, updated_at=now()
        where id=${s.prospect_id} and status not in ('replied','won','lost','unsubscribed','bounced')`;
      await advancePastStep(s.id);
      results.push({ id: s.id, business: s.business, sent: true, messageId: info.messageId });
    } catch (err) {
      await sql`update sends set status='failed', error=${String(err.message || err)} where id=${s.id}`;
      results.push({ id: s.id, business: s.business, error: String(err.message || err) });
    }
    if (i < rows.length - 1) {
      const j = jitterMs ?? 6000 + Math.floor(Math.random() * 8000);
      await sleep(j);
    }
  }

  const [{ remaining }] = await sql`select count(*)::int as remaining from sends where status='approved'`;
  return { processed: results.length, remaining, results };
}
