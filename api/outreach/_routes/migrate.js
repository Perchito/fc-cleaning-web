// ONE-OFF: copy the legacy Vercel Blob store (outreach/prospects.json) into
// Postgres. Sits behind the /ops Basic-auth middleware. Delete this file once
// the migration is verified on prod.
//
//   curl --location-trusted -u "$OPS_USER:$OPS_PASS" \
//     "https://<preview-or-prod>/api/outreach/migrate?confirm=reset"
//
// ?confirm=reset  truncates the outreach tables first (safe: pre-cutover the
// only rows are earlier migration attempts).

import { get } from "@vercel/blob";
import { sql } from "../_lib/db.js";
import { createCampaign } from "../_lib/campaigns.js";
import { LEGACY_CAMPAIGN } from "../_lib/seed-campaign.js";

const BOUNCE_OR_UNSUB = ["bounced", "unsubscribed"];

export default async function handler(req, res) {
  let blob;
  try {
    const r = await get("outreach/prospects.json", { access: "private", useCache: false });
    blob = await new Response(r.stream).json();
  } catch (err) {
    return res.status(502).json({ error: "could not read blob: " + String(err?.message || err) });
  }
  const prospects = blob.prospects || [];

  if (req.query.confirm === "reset") {
    await sql`truncate prospects, campaigns, campaign_steps, enrollments, sends, events, suppression, meta cascade`;
  }

  // Seed the "Legacy" campaign so past outreach shows up in analytics.
  let legacy = (await sql`select id from campaigns where name = ${LEGACY_CAMPAIGN.name}`)[0];
  if (!legacy) legacy = await createCampaign(LEGACY_CAMPAIGN);
  const legacyId = legacy.id;
  const legacySteps = await sql`
    select id, step_index from campaign_steps where campaign_id = ${legacyId} order by step_index`;

  let np = 0,
    ns = 0,
    ne = 0,
    nsup = 0,
    nenr = 0;

  for (const p of prospects) {
    const initialCount = (p.sends || []).filter((s) => s.type === "initial").length;
    const followUps = p.followUpsSent ?? Math.max(0, (p.sends || []).length - Math.max(1, initialCount));

    await sql`
      insert into prospects
        (id, business, email, contact_name, source, address, location, phone, website,
         preferred_channel, hook, tags, notes, status, followups_sent,
         last_reply_at, reply_snippet, reply_message_id,
         auto_ack_at, auto_ack_snippet, auto_ack_message_id, bounce_reason,
         created_at, updated_at)
      values (
        ${p.id}, ${p.business}, ${String(p.email).toLowerCase().trim()},
        ${p.contactName || null}, ${p.source || null}, ${p.address || null},
        ${p.location || null}, ${p.phone || null}, ${p.website || null},
        ${p.preferredChannel || null}, ${p.hook || null}, ${p.tags || []},
        ${p.notes || ""}, ${p.status || "draft"}, ${followUps},
        ${p.lastReplyAt || null}, ${p.replySnippet || null}, ${p.replyMessageId || null},
        ${p.autoAckAt || null}, ${p.autoAckSnippet || null}, ${p.autoAckMessageId || null},
        ${p.bounceReason || null},
        ${p.createdAt || new Date().toISOString()}, ${p.updatedAt || new Date().toISOString()}
      )
      on conflict (id) do nothing`;
    np++;

    // one completed "Legacy" enrollment per already-contacted prospect
    let enrId = null;
    if ((p.sends || []).length) {
      const rows = await sql`
        insert into enrollments (campaign_id, prospect_id, status, current_step, enrolled_at)
        values (${legacyId}, ${p.id}, 'completed', ${Math.min(2, p.sends.length)},
                ${p.sends[0]?.sentAt || p.createdAt || new Date().toISOString()})
        on conflict (campaign_id, prospect_id) do nothing
        returning id`;
      enrId =
        rows[0]?.id ??
        (await sql`select id from enrollments where campaign_id=${legacyId} and prospect_id=${p.id}`)[0]?.id;
      if (rows[0]) nenr++;
    }

    let idx = 0;
    for (const s of p.sends || []) {
      const stepIndex = s.type === "initial" ? 0 : idx > 0 ? idx : 1;
      const stepId = legacySteps[Math.min(stepIndex, legacySteps.length - 1)]?.id ?? null;
      await sql`
        insert into sends (prospect_id, campaign_id, enrollment_id, step_id, step_index,
                           subject, body, status, message_id, sent_at, queued_at)
        values (${p.id}, ${legacyId}, ${enrId}, ${stepId}, ${stepIndex},
                ${s.subject || ""}, '', 'sent', ${s.messageId || null}, ${s.sentAt}, ${s.sentAt})`;
      await sql`
        insert into events (prospect_id, campaign_id, enrollment_id, type, subject, message_id, at)
        values (${p.id}, ${legacyId}, ${enrId}, 'sent', ${s.subject || ""}, ${s.messageId || null}, ${s.sentAt})`;
      ns++;
      ne++;
      idx++;
    }

    for (const c of p.calls || []) {
      await sql`
        insert into events (prospect_id, type, at, meta)
        values (${p.id}, 'call', ${c.at},
                ${JSON.stringify({ note: c.note || "", outcome: c.outcome || null })}::jsonb)`;
      ne++;
    }

    if (p.lastReplyAt || p.replySnippet) {
      await sql`
        insert into events (prospect_id, campaign_id, enrollment_id, type, at, snippet, message_id)
        values (${p.id}, ${legacyId}, ${enrId}, 'reply', ${p.lastReplyAt || p.updatedAt},
                ${p.replySnippet || null}, ${p.replyMessageId || null})`;
      ne++;
    }
    if (p.autoAckAt) {
      await sql`
        insert into events (prospect_id, type, at, snippet, message_id)
        values (${p.id}, 'auto_ack', ${p.autoAckAt}, ${p.autoAckSnippet || null},
                ${p.autoAckMessageId || null})`;
      ne++;
    }
    if (p.bounceReason) {
      await sql`
        insert into events (prospect_id, type, at, snippet)
        values (${p.id}, 'bounce', ${p.updatedAt}, ${p.bounceReason})`;
      ne++;
    }

    if (BOUNCE_OR_UNSUB.includes(p.status)) {
      await sql`
        insert into suppression (email, reason)
        values (${String(p.email).toLowerCase().trim()}, ${p.status})
        on conflict (email) do nothing`;
      nsup++;
    }
  }

  if (blob.lastPollAt) {
    await sql`
      insert into meta (k, v) values ('lastPollAt', ${JSON.stringify(blob.lastPollAt)}::jsonb)
      on conflict (k) do update set v = excluded.v`;
  }

  return res.json({
    ok: true,
    prospects: np,
    enrollments: nenr,
    sends: ns,
    events: ne,
    suppressed: nsup,
    legacyCampaignId: legacyId,
    fromBlob: prospects.length,
  });
}
