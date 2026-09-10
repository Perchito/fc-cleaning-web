// Prospect data access + the decoration/derivation logic the dashboard relies
// on. Backed by Neon Postgres (see db.js). Replaces the old Vercel-Blob
// `store.js` — same `decorate()` output shape so `public/ops/app.js` is
// unchanged.

import { sql } from "./db.js";
import { config } from "./config.js";

export function nowISO() {
  return new Date().toISOString();
}

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// --- meta key/value (lastPollAt etc.) ---
export async function getMeta(k) {
  const rows = await sql`select v from meta where k = ${k}`;
  return rows[0]?.v ?? null;
}
export async function setMeta(k, v) {
  await sql`
    insert into meta (k, v) values (${k}, ${JSON.stringify(v)}::jsonb)
    on conflict (k) do update set v = excluded.v`;
}

// --- row -> the object shape the rest of the code expects ---
const iso = (v) => (v ? new Date(v).toISOString() : v ?? null);

function rowToProspect(r) {
  return {
    id: r.id,
    business: r.business,
    email: r.email,
    contactName: r.contact_name,
    source: r.source,
    address: r.address,
    location: r.location,
    phone: r.phone,
    website: r.website,
    preferredChannel: r.preferred_channel,
    hook: r.hook,
    tags: r.tags || [],
    notes: r.notes || "",
    status: r.status,
    followUpIntervalDays: config.followUpIntervalDays,
    maxFollowUps: config.maxFollowUps,
    followUpsSent: r.followups_sent ?? 0,
    sends: (r.sends || []).map((s) => ({
      type: s.type,
      subject: s.subject,
      messageId: s.messageId,
      sentAt: iso(s.sentAt),
    })),
    calls: (r.calls || []).map((c) => ({ at: iso(c.at), note: c.note, outcome: c.outcome })),
    lastReplyAt: iso(r.last_reply_at),
    replySnippet: r.reply_snippet,
    replyMessageId: r.reply_message_id,
    autoAckAt: iso(r.auto_ack_at),
    autoAckSnippet: r.auto_ack_snippet,
    autoAckMessageId: r.auto_ack_message_id,
    bounceReason: r.bounce_reason,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

// Base select with the nested sends[] / calls[] arrays rebuilt as JSON.
// Plain string so it can be composed with sql.query() (tagged-template
// fragments can't be interpolated into other queries).
const SELECT = `
  select
    p.*,
    coalesce(s.sends, '[]'::json) as sends,
    coalesce(c.calls, '[]'::json) as calls
  from prospects p
  left join lateral (
    select json_agg(
      json_build_object(
        'type', case when step_index is not null and step_index >= 1 then 'follow_up' else 'initial' end,
        'subject', subject,
        'messageId', message_id,
        'sentAt', sent_at
      ) order by sent_at
    ) as sends
    from sends
    where prospect_id = p.id and status = 'sent'
  ) s on true
  left join lateral (
    select json_agg(
      json_build_object('at', at, 'note', meta->>'note', 'outcome', meta->>'outcome')
      order by at
    ) as calls
    from events
    where prospect_id = p.id and type = 'call'
  ) c on true
`;

export async function listProspects() {
  const rows = await sql.query(`${SELECT} order by p.created_at`);
  return rows.map(rowToProspect);
}

export async function getProspect(id) {
  const rows = await sql.query(`${SELECT} where p.id = $1`, [id]);
  return rows[0] ? rowToProspect(rows[0]) : null;
}

const UPSERT_FIELDS = {
  business: "business",
  contactName: "contact_name",
  email: "email",
  source: "source",
  address: "address",
  location: "location",
  phone: "phone",
  website: "website",
  preferredChannel: "preferred_channel",
  hook: "hook",
  notes: "notes",
  tags: "tags",
};

/** Create a prospect (status: draft) or patch an existing one. */
export async function upsertProspect(data) {
  const id = data.id || slugify(data.business);
  const existing = await sql`select id from prospects where id = ${id}`;

  if (!existing[0]) {
    await sql`
      insert into prospects
        (id, business, email, contact_name, source, address, location, phone,
         website, preferred_channel, hook, tags, notes, status)
      values (
        ${id}, ${data.business}, ${String(data.email).toLowerCase().trim()},
        ${data.contactName || null}, ${data.source || null}, ${data.address || null},
        ${data.location || null}, ${data.phone || null}, ${data.website || null},
        ${data.preferredChannel || null}, ${data.hook || null},
        ${data.tags || []}, ${data.notes || ""}, 'draft'
      )`;
    return getProspect(id);
  }

  const sets = [];
  const vals = [];
  for (const [key, col] of Object.entries(UPSERT_FIELDS)) {
    if (data[key] === undefined) continue;
    let v = data[key];
    if (key === "email") v = String(v).toLowerCase().trim();
    sets.push(`${col} = $${sets.length + 1}`);
    vals.push(v);
  }
  if (sets.length) {
    vals.push(id);
    await sql.query(
      `update prospects set ${sets.join(", ")}, updated_at = now() where id = $${vals.length}`,
      vals,
    );
  }
  return getProspect(id);
}

export async function setStatus(id, { status, notes }) {
  const p = await sql`select id from prospects where id = ${id}`;
  if (!p[0]) return null;
  if (status !== undefined && notes !== undefined) {
    await sql`update prospects set status = ${status}, notes = ${notes}, updated_at = now() where id = ${id}`;
  } else if (status !== undefined) {
    await sql`update prospects set status = ${status}, updated_at = now() where id = ${id}`;
  } else if (notes !== undefined) {
    await sql`update prospects set notes = ${notes}, updated_at = now() where id = ${id}`;
  }
  return getProspect(id);
}

const CALL_KEEP = ["replied", "won", "lost", "unsubscribed", "bounced"];

export async function logCall(id, { note, outcome }) {
  const p = await sql`select status from prospects where id = ${id}`;
  if (!p[0]) return null;
  await sql`
    insert into events (prospect_id, type, meta)
    values (${id}, 'call', ${JSON.stringify({
      note: String(note || "").slice(0, 500),
      outcome: outcome || null,
    })}::jsonb)`;
  if (!CALL_KEEP.includes(p[0].status)) {
    await sql`update prospects set status = 'awaiting_reply', updated_at = now() where id = ${id}`;
  } else {
    await sql`update prospects set updated_at = now() where id = ${id}`;
  }
  return getProspect(id);
}

/** Record an outbound email that just went out. */
export async function recordSend(id, { subject, messageId, sentAt, isInitial }) {
  const stepIndex = isInitial ? 0 : 1;
  await sql`
    insert into sends (prospect_id, step_index, subject, body, status, message_id, sent_at)
    values (${id}, ${stepIndex}, ${subject}, '', 'sent', ${messageId}, ${sentAt})`;
  await sql`
    insert into events (prospect_id, type, subject, message_id, at)
    values (${id}, 'sent', ${subject}, ${messageId}, ${sentAt})`;
  await sql`
    update prospects
      set status = 'awaiting_reply',
          followups_sent = followups_sent + ${isInitial ? 0 : 1},
          updated_at = now()
    where id = ${id}`;
  return getProspect(id);
}

// --- inbound reconciliation (used by the IMAP poll) ---
export async function applyReply(id, { at, snippet, messageId }) {
  await sql`
    update prospects
      set status = 'replied', last_reply_at = ${at}, reply_snippet = ${snippet},
          reply_message_id = ${messageId}, updated_at = now()
    where id = ${id}`;
  await sql`
    insert into events (prospect_id, type, at, snippet, message_id)
    values (${id}, 'reply', ${at}, ${snippet}, ${messageId})`;
}

export async function applyAutoAck(id, { at, snippet, messageId }) {
  await sql`
    update prospects
      set auto_ack_at = ${at}, auto_ack_snippet = ${snippet},
          auto_ack_message_id = ${messageId}, updated_at = now()
    where id = ${id}`;
  await sql`
    insert into events (prospect_id, type, at, snippet, message_id)
    values (${id}, 'auto_ack', ${at}, ${snippet}, ${messageId})`;
}

export async function applyBounce(id, { reason }) {
  await sql`
    update prospects
      set status = 'bounced', bounce_reason = ${reason}, updated_at = now()
    where id = ${id}`;
  await sql`insert into events (prospect_id, type, snippet) values (${id}, 'bounce', ${reason})`;
}

// ------- pure derivation helpers (unchanged from the old store.js) -------

function daysBetween(a, b) {
  return (new Date(b) - new Date(a)) / 86_400_000;
}

export function lastSend(p) {
  if (!p.sends?.length) return null;
  return p.sends.reduce((a, b) => (new Date(a.sentAt) > new Date(b.sentAt) ? a : b));
}

export function lastContact(p) {
  const events = [
    ...(p.sends || []).map((s) => ({
      at: s.sentAt,
      type: s.type === "initial" ? "initial email" : "email follow-up",
    })),
    ...(p.calls || []).map((c) => ({ at: c.at, type: "phone call" })),
  ].filter((e) => e.at);
  if (!events.length) return null;
  return events.reduce((a, b) => (new Date(a.at) > new Date(b.at) ? a : b));
}

export function attemptsMade(p) {
  return (p.followUpsSent ?? 0) + (p.calls?.length ?? 0);
}

export function nextChannel(p) {
  if (p.preferredChannel === "phone" || p.preferredChannel === "email") return p.preferredChannel;
  return attemptsMade(p) >= 1 ? "phone" : "email";
}

export function effectiveStatus(p) {
  const terminal = ["replied", "bounced", "won", "lost", "unsubscribed", "draft"];
  if (terminal.includes(p.status)) return p.status;
  const lc = lastContact(p);
  if (!lc) return "draft";
  const age = daysBetween(lc.at, nowISO());
  const interval = p.followUpIntervalDays ?? config.followUpIntervalDays;
  const max = p.maxFollowUps ?? config.maxFollowUps;
  if (age >= interval && attemptsMade(p) < max) return "follow_up_due";
  return "awaiting_reply";
}

export function decorate(p) {
  const lc = lastContact(p);
  const ls = lastSend(p);
  const eff = effectiveStatus(p);
  const interval = p.followUpIntervalDays ?? config.followUpIntervalDays;
  const channel = nextChannel(p);
  const nextActionAt = lc
    ? new Date(new Date(lc.at).getTime() + interval * 86_400_000).toISOString()
    : null;
  return {
    ...p,
    effectiveStatus: eff,
    lastContactAt: lc?.at ?? null,
    lastContactType: lc?.type ?? null,
    lastSendAt: ls?.sentAt ?? null,
    lastSendType: ls?.type ?? null,
    daysSinceLastContact: lc ? Math.floor(daysBetween(lc.at, nowISO())) : null,
    daysUntilFollowUp:
      lc && eff === "awaiting_reply" ? Math.ceil(interval - daysBetween(lc.at, nowISO())) : null,
    nextActionChannel: eff === "awaiting_reply" || eff === "follow_up_due" ? channel : null,
    nextActionAt: eff === "awaiting_reply" ? nextActionAt : eff === "follow_up_due" ? nowISO() : null,
    callsMade: p.calls?.length ?? 0,
    followUpsRemaining: (p.maxFollowUps ?? config.maxFollowUps) - attemptsMade(p),
  };
}
