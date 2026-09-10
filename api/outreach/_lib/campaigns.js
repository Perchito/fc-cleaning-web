// Campaigns, steps, enrollments — data layer.

import { sql } from "./db.js";
import { nowISO } from "./prospects.js";

const iso = (v) => (v ? new Date(v).toISOString() : null);

function campaignRow(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    status: r.status,
    pausedReason: r.paused_reason,
    dailyCap: r.daily_cap,
    abMinSends: r.ab_min_sends,
    sendDays: r.send_days,
    windowStart: r.window_start,
    windowEnd: r.window_end,
    timezone: r.timezone,
    fromName: r.from_name,
    fromAddress: r.from_address,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function stepRow(r) {
  return {
    id: r.id,
    stepIndex: r.step_index,
    kind: r.kind,
    mode: r.mode,
    waitDays: r.wait_days,
    subjectTmpl: r.subject_tmpl || "",
    bodyTmpl: r.body_tmpl || "",
    aiGuidance: r.ai_guidance || "",
    abEnabled: r.ab_enabled,
    subjectTmplB: r.subject_tmpl_b || "",
    bodyTmplB: r.body_tmpl_b || "",
    taskNote: r.task_note || "",
    active: r.active,
  };
}

export async function listCampaigns() {
  const rows = await sql`select * from campaigns order by created_at desc`;
  const ids = rows.map((r) => r.id);
  let stepsByC = {};
  let statsByC = {};
  if (ids.length) {
    const steps = await sql`
      select * from campaign_steps where campaign_id = any(${ids}) order by step_index`;
    for (const s of steps) (stepsByC[s.campaign_id] ||= []).push(stepRow(s));

    const st = await sql`
      select
        c.id as campaign_id,
        count(distinct e.id)                                          as enrolled,
        count(distinct e.id) filter (where e.status = 'active')       as active,
        count(distinct e.id) filter (where e.status = 'completed')    as completed,
        count(distinct e.id) filter (where e.status = 'stopped')      as stopped,
        count(distinct s.id) filter (where s.status = 'sent')         as sent,
        count(distinct ev.id) filter (where ev.type = 'reply')        as replies,
        count(distinct ev.id) filter (where ev.type = 'bounce')       as bounces
      from campaigns c
      left join enrollments e on e.campaign_id = c.id
      left join sends s       on s.campaign_id = c.id
      left join events ev     on ev.campaign_id = c.id
      where c.id = any(${ids})
      group by c.id`;
    for (const r of st) {
      const sent = Number(r.sent);
      statsByC[r.campaign_id] = {
        enrolled: Number(r.enrolled),
        active: Number(r.active),
        completed: Number(r.completed),
        stopped: Number(r.stopped),
        sent,
        replies: Number(r.replies),
        bounces: Number(r.bounces),
        replyRate: sent ? Number(r.replies) / sent : 0,
      };
    }
  }
  return rows.map((r) => ({
    ...campaignRow(r),
    steps: stepsByC[r.id] || [],
    stats: statsByC[r.id] || {
      enrolled: 0,
      active: 0,
      completed: 0,
      stopped: 0,
      sent: 0,
      replies: 0,
      bounces: 0,
      replyRate: 0,
    },
  }));
}

export async function getCampaign(id) {
  const rows = await sql`select * from campaigns where id = ${id}`;
  if (!rows[0]) return null;
  const steps = await sql`
    select * from campaign_steps where campaign_id = ${id} order by step_index`;
  return { ...campaignRow(rows[0]), steps: steps.map(stepRow) };
}

const C_FIELDS = {
  name: "name",
  description: "description",
  status: "status",
  pausedReason: "paused_reason",
  dailyCap: "daily_cap",
  abMinSends: "ab_min_sends",
  sendDays: "send_days",
  windowStart: "window_start",
  windowEnd: "window_end",
  timezone: "timezone",
  fromName: "from_name",
  fromAddress: "from_address",
};

async function writeSteps(campaignId, steps) {
  await sql`delete from campaign_steps where campaign_id = ${campaignId}`;
  let i = 0;
  for (const s of steps || []) {
    await sql`
      insert into campaign_steps
        (campaign_id, step_index, kind, mode, wait_days, subject_tmpl, body_tmpl,
         ai_guidance, ab_enabled, subject_tmpl_b, body_tmpl_b, task_note, active)
      values (
        ${campaignId}, ${i}, ${s.kind || "email"}, ${s.mode || "template"},
        ${Number(s.waitDays) || 0}, ${s.subjectTmpl || null}, ${s.bodyTmpl || null},
        ${s.aiGuidance || null}, ${!!s.abEnabled}, ${s.subjectTmplB || null},
        ${s.bodyTmplB || null}, ${s.taskNote || null}, ${s.active !== false}
      )`;
    i++;
  }
}

export async function createCampaign(data) {
  const rows = await sql`
    insert into campaigns (name, description, status, daily_cap, ab_min_sends,
                           send_days, window_start, window_end, timezone,
                           from_name, from_address)
    values (
      ${data.name || "Untitled campaign"}, ${data.description || null},
      ${data.status || "draft"}, ${data.dailyCap ?? 25}, ${data.abMinSends ?? 8},
      ${data.sendDays || [1, 2, 3, 4, 5]}, ${data.windowStart || "08:00"},
      ${data.windowEnd || "16:00"}, ${data.timezone || "Europe/London"},
      ${data.fromName || null}, ${data.fromAddress || null}
    )
    returning id`;
  const id = rows[0].id;
  await writeSteps(id, data.steps);
  return getCampaign(id);
}

export async function updateCampaign(id, data) {
  const sets = [];
  const vals = [];
  for (const [key, col] of Object.entries(C_FIELDS)) {
    if (data[key] === undefined) continue;
    sets.push(`${col} = $${sets.length + 1}`);
    vals.push(data[key]);
  }
  if (sets.length) {
    vals.push(id);
    await sql.query(
      `update campaigns set ${sets.join(", ")}, updated_at = now() where id = $${vals.length}`,
      vals,
    );
  }
  if (Array.isArray(data.steps)) await writeSteps(id, data.steps);
  return getCampaign(id);
}

// ─────────────────────────────── enrollment ───────────────────────────────

/**
 * Enrol prospects into a campaign. Skips: already enrolled, suppressed,
 * terminal-status prospects. Returns { enrolled: [...ids], skipped: [{id, reason}] }.
 */
export async function enrollProspects(campaignId, prospectIds) {
  const camp = await sql`select id, status from campaigns where id = ${campaignId}`;
  if (!camp[0]) return { error: "campaign not found" };

  const ids = [...new Set(prospectIds)];
  const enrolled = [];
  const skipped = [];

  const existing = new Set(
    (
      await sql`select prospect_id from enrollments where campaign_id = ${campaignId} and prospect_id = any(${ids})`
    ).map((r) => r.prospect_id),
  );
  const suppressed = new Set(
    (
      await sql`
      select p.id from prospects p
      join suppression s on s.email = p.email
      where p.id = any(${ids})`
    ).map((r) => r.id),
  );
  const prospects = await sql`select id, status from prospects where id = any(${ids})`;
  const statusById = Object.fromEntries(prospects.map((p) => [p.id, p.status]));
  const TERMINAL = ["unsubscribed", "bounced"];

  for (const id of ids) {
    if (!(id in statusById)) {
      skipped.push({ id, reason: "not found" });
      continue;
    }
    if (existing.has(id)) {
      skipped.push({ id, reason: "already enrolled" });
      continue;
    }
    if (suppressed.has(id) || TERMINAL.includes(statusById[id])) {
      skipped.push({ id, reason: "suppressed" });
      continue;
    }
    await sql`
      insert into enrollments (campaign_id, prospect_id, status, current_step, next_due_at)
      values (${campaignId}, ${id}, 'active', 0, now())`;
    // A draft prospect entering a campaign is now in flight.
    await sql`update prospects set status = 'awaiting_reply', updated_at = now()
             where id = ${id} and status = 'draft'`;
    enrolled.push(id);
  }
  return { enrolled, skipped };
}

export async function unenroll(enrollmentId, reason = "manual") {
  await sql`
    update enrollments set status = 'stopped', stopped_reason = ${reason}, updated_at = now()
    where id = ${enrollmentId}`;
  return { ok: true };
}

/** Stop every active enrollment for a prospect (used on reply/bounce/unsub). */
export async function stopEnrollmentsForProspect(prospectId, reason) {
  await sql`
    update enrollments set status = 'stopped', stopped_reason = ${reason}, updated_at = now()
    where prospect_id = ${prospectId} and status = 'active'`;
}

export async function listEnrollmentsForProspect(prospectId) {
  const rows = await sql`
    select e.*, c.name as campaign_name
    from enrollments e join campaigns c on c.id = e.campaign_id
    where e.prospect_id = ${prospectId}
    order by e.enrolled_at desc`;
  return rows.map((r) => ({
    id: r.id,
    campaignId: r.campaign_id,
    campaignName: r.campaign_name,
    status: r.status,
    currentStep: r.current_step,
    nextDueAt: iso(r.next_due_at),
    stoppedReason: r.stopped_reason,
    enrolledAt: iso(r.enrolled_at),
  }));
}

export { nowISO };
