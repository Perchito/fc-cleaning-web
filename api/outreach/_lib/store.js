// Data store backed by a single private Vercel Blob JSON file. Small dataset,
// single user — one read / one write per request is fine. `useCache: false`
// gives read-after-write consistency so changes are seen immediately.

import { get, put } from "@vercel/blob";
import { config } from "./config.js";
import { seed } from "./seed.js";

const KEY = config.blobKey;

export async function load() {
  let r = null;
  try {
    r = await get(KEY, { access: "private", useCache: false });
  } catch (err) {
    const missing =
      err?.name === "BlobNotFoundError" || /not.*found|404/i.test(String(err?.message));
    if (!missing) throw err;
  }
  if (r?.stream) return normalise(await new Response(r.stream).json());

  // Blob doesn't exist yet — first run. Seed it from the bundled snapshot.
  const initial = normalise(structuredClone(seed));
  await save(initial);
  return initial;
}

export async function save(db) {
  await put(KEY, JSON.stringify(db, null, 2), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

// Backfill fields added after a prospect was first stored.
function normalise(db) {
  for (const p of db.prospects || []) {
    p.address ??= null;
    p.location ??= null;
    p.phone ??= null;
    p.website ??= null;
    p.calls ??= [];
  }
  return db;
}

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

function daysBetween(a, b) {
  return (new Date(b) - new Date(a)) / 86_400_000;
}

export function lastSend(p) {
  if (!p.sends?.length) return null;
  return p.sends.reduce((a, b) => (new Date(a.sentAt) > new Date(b.sentAt) ? a : b));
}

/** Latest outbound touch of any kind — email or phone call. */
export function lastContact(p) {
  const events = [
    ...(p.sends || []).map((s) => ({ at: s.sentAt, type: s.type === "initial" ? "initial email" : "email follow-up" })),
    ...(p.calls || []).map((c) => ({ at: c.at, type: "phone call" })),
  ].filter((e) => e.at);
  if (!events.length) return null;
  return events.reduce((a, b) => (new Date(a.at) > new Date(b.at) ? a : b));
}

/** Follow-up attempts made so far (excludes the first email). */
export function attemptsMade(p) {
  return (p.followUpsSent ?? 0) + (p.calls?.length ?? 0);
}

/** Which channel the next nudge should use: first nudge email, then phone. */
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
  const nextActionAt = lc ? new Date(new Date(lc.at).getTime() + interval * 86_400_000).toISOString() : null;
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

export function getProspect(db, id) {
  return db.prospects.find((p) => p.id === id);
}

const FIELDS = ["business", "contactName", "source", "address", "location", "phone", "website", "notes", "preferredChannel"];

export function upsertProspect(db, data) {
  const id = data.id || slugify(data.business);
  let p = getProspect(db, id);
  if (!p) {
    p = {
      id,
      business: data.business,
      email: String(data.email).toLowerCase().trim(),
      contactName: data.contactName || null,
      source: data.source || null,
      address: data.address || null,
      location: data.location || null,
      phone: data.phone || null,
      website: data.website || null,
      preferredChannel: data.preferredChannel || null,
      tags: data.tags || [],
      status: "draft",
      followUpIntervalDays: data.followUpIntervalDays ?? config.followUpIntervalDays,
      maxFollowUps: data.maxFollowUps ?? config.maxFollowUps,
      sends: [],
      calls: [],
      followUpsSent: 0,
      lastReplyAt: null,
      replySnippet: null,
      replyMessageId: null,
      autoAckAt: null,
      autoAckSnippet: null,
      autoAckMessageId: null,
      bounceReason: null,
      notes: data.notes || "",
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    db.prospects.push(p);
  } else {
    if (data.email) p.email = String(data.email).toLowerCase().trim();
    for (const f of FIELDS) if (data[f] !== undefined) p[f] = data[f];
    p.updatedAt = nowISO();
  }
  return p;
}
