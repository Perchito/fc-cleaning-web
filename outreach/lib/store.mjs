// JSON-file data store. Small scale (dozens–hundreds of prospects), so a
// single file read/write per operation is fine. All writes go through save()
// which writes atomically (tmp file + rename).

import {
  readFileSync,
  writeFileSync,
  renameSync,
  appendFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { DATA_DIR, config } from "./config.mjs";

const PROSPECTS = join(DATA_DIR, "prospects.json");
const SEED = join(DATA_DIR, "prospects.seed.json");
const SENDS_LOG = join(DATA_DIR, "sends.jsonl");

mkdirSync(DATA_DIR, { recursive: true });

/** @typedef {"awaiting_reply"|"follow_up_due"|"replied"|"bounced"|"won"|"lost"|"unsubscribed"|"draft"} Status */

export function slugify(s) {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function load() {
  if (existsSync(PROSPECTS)) return JSON.parse(readFileSync(PROSPECTS, "utf8"));
  // Optional local bootstrap file (not tracked); otherwise start empty.
  if (existsSync(SEED)) {
    const seeded = JSON.parse(readFileSync(SEED, "utf8"));
    save(seeded);
    return seeded;
  }
  return { prospects: [] };
}

export function save(db) {
  const tmp = PROSPECTS + ".tmp";
  writeFileSync(tmp, JSON.stringify(db, null, 2));
  renameSync(tmp, PROSPECTS);
}

export function logSend(entry) {
  appendFileSync(SENDS_LOG, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}

export function nowISO() {
  return new Date().toISOString();
}

function daysBetween(a, b) {
  return (new Date(b) - new Date(a)) / 86_400_000;
}

/** Last outbound send (initial or follow-up) for a prospect. */
export function lastSend(p) {
  if (!p.sends?.length) return null;
  return p.sends.reduce((a, b) => (new Date(a.sentAt) > new Date(b.sentAt) ? a : b));
}

/**
 * Derive the effective status for display. Persisted status wins for terminal
 * / human-set states; "awaiting_reply" is upgraded to "follow_up_due" once the
 * interval has elapsed and follow-ups remain.
 */
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
  const daysSinceLastSend = ls ? Math.floor(daysBetween(ls.sentAt, nowISO())) : null;
  const daysUntilFollowUp =
    ls && eff === "awaiting_reply" ? Math.ceil(interval - daysBetween(ls.sentAt, nowISO())) : null;
  return {
    ...p,
    effectiveStatus: eff,
    lastSendAt: ls?.sentAt ?? null,
    lastSendType: ls?.type ?? null,
    daysSinceLastSend,
    daysUntilFollowUp,
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
      email: data.email.toLowerCase().trim(),
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
      source: data.source ?? p.source,
      tags: data.tags ?? p.tags,
      notes: data.notes ?? p.notes,
      updatedAt: nowISO(),
    });
  }
  return p;
}
