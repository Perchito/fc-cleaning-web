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
  if (r?.stream) return await new Response(r.stream).json();

  // Blob doesn't exist yet — first run. Seed it from the bundled snapshot.
  const initial = structuredClone(seed);
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

export function effectiveStatus(p) {
  const terminal = ["replied", "bounced", "won", "lost", "unsubscribed", "draft"];
  if (terminal.includes(p.status)) return p.status;
  const ls = lastSend(p);
  if (!ls) return "draft";
  const age = daysBetween(ls.sentAt, nowISO());
  const interval = p.followUpIntervalDays ?? config.followUpIntervalDays;
  const max = p.maxFollowUps ?? config.maxFollowUps;
  if (age >= interval && (p.followUpsSent ?? 0) < max) return "follow_up_due";
  return "awaiting_reply";
}

export function decorate(p) {
  const ls = lastSend(p);
  const eff = effectiveStatus(p);
  const interval = p.followUpIntervalDays ?? config.followUpIntervalDays;
  return {
    ...p,
    effectiveStatus: eff,
    lastSendAt: ls?.sentAt ?? null,
    lastSendType: ls?.type ?? null,
    daysSinceLastSend: ls ? Math.floor(daysBetween(ls.sentAt, nowISO())) : null,
    daysUntilFollowUp:
      ls && eff === "awaiting_reply" ? Math.ceil(interval - daysBetween(ls.sentAt, nowISO())) : null,
    followUpsRemaining: (p.maxFollowUps ?? config.maxFollowUps) - (p.followUpsSent ?? 0),
  };
}

export function getProspect(db, id) {
  return db.prospects.find((p) => p.id === id);
}

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
      tags: data.tags || [],
      status: "draft",
      followUpIntervalDays: data.followUpIntervalDays ?? config.followUpIntervalDays,
      maxFollowUps: data.maxFollowUps ?? config.maxFollowUps,
      sends: [],
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
    Object.assign(p, {
      business: data.business ?? p.business,
      email: (data.email ?? p.email).toLowerCase().trim(),
      contactName: data.contactName ?? p.contactName,
      notes: data.notes ?? p.notes,
      updatedAt: nowISO(),
    });
  }
  return p;
}
