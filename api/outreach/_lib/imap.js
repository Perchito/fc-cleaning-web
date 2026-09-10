// Poll the iCloud inbox and reconcile replies / auto-acks / bounces against
// sent mail. See notes in the local version (outreach/lib/imap.mjs) — same
// logic, adapted for the Postgres store and the serverless time budget.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { config } from "./config.js";
import {
  listProspects,
  lastSend,
  nowISO,
  setMeta,
  applyReply,
  applyAutoAck,
  applyBounce,
} from "./prospects.js";
import { stopEnrollmentsForProspect } from "./campaigns.js";
import { suppress, looksLikeUnsubscribe } from "./suppression.js";
import { classifyReply } from "./ai.js";
import { sql } from "./db.js";

const MAX_CLASSIFY_PER_POLL = 6;

const TERMINAL = ["replied", "won", "lost", "unsubscribed"];

function normId(s) {
  return String(s || "").trim().replace(/^<|>$/g, "").toLowerCase();
}
function idsFromHeader(value) {
  return String(value || "").split(/\s+/).map(normId).filter(Boolean);
}

const AUTO_SUBJECT =
  /\b(out of office|auto(?:matic)?[-\s]?reply|automatic response|thanks for (?:your (?:message|email|e-mail|enquiry|inquiry)|contacting)|we(?:'ve| have) received your)/i;

function looksAutomated(parsed) {
  if (!parsed) return false;
  const h = parsed.headers || new Map();
  const get = (k) => String(h.get(k) || "").toLowerCase();
  const autoSubmitted = get("auto-submitted");
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (h.has("x-autoreply") || h.has("x-autorespond") || h.has("x-auto-response-suppress")) return true;
  if (["auto_reply", "bulk", "junk", "list"].includes(get("precedence"))) return true;
  if (AUTO_SUBJECT.test(parsed.subject || "")) return true;
  return false;
}

/**
 * @param {object} [opts]
 * @param {object[]} [opts.prospects] already-loaded prospect list (from listProspects)
 * @param {number} [opts.sinceDays]
 */
export async function pollReplies({ prospects, sinceDays = 45 } = {}) {
  const all = prospects || (await listProspects());
  const active = all.filter((p) => !TERMINAL.includes(p.status) && p.sends?.length);
  if (!active.length) {
    const ranAt = nowISO();
    await setMeta("lastPollAt", ranAt);
    return { checked: 0, replies: [], acks: [], bounces: [], scanned: 0, ranAt };
  }

  const byMessageId = new Map();
  const byEmail = new Map();
  for (const p of active) {
    byEmail.set(p.email.toLowerCase(), p);
    for (const s of p.sends) byMessageId.set(normId(s.messageId), p);
  }

  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: { user: config.imap.user, pass: config.imap.pass },
    logger: false,
    greetingTimeout: 10000,
    socketTimeout: 25000,
  });

  let scanned = 0;
  const candidates = [];

  await client.connect();
  let lock = await client.getMailboxLock("INBOX");
  try {
    for await (const msg of client.fetch(
      { since },
      { uid: true, envelope: true, headers: ["in-reply-to", "references"] },
    )) {
      scanned++;
      const env = msg.envelope || {};
      const fromAddr = (env.from?.[0]?.address || "").toLowerCase();
      const subject = env.subject || "";
      const headerText = (msg.headers || Buffer.alloc(0)).toString();
      const refIds = new Set([
        ...idsFromHeader((headerText.match(/^in-reply-to:(.*)$/im) || [])[1]),
        ...idsFromHeader((headerText.match(/^references:(.*)$/im) || [])[1]),
      ]);
      const base = {
        uid: msg.uid,
        date: env.date ? new Date(env.date) : new Date(),
        subject,
        from: fromAddr,
        messageId: normId(env.messageId),
      };

      const daemon =
        /mailer-daemon|postmaster/.test(fromAddr) ||
        /mail delivery|undeliverable|delivery status notification|returned mail|failure notice/i.test(subject);
      if (daemon) {
        candidates.push({ ...base, prospect: null, kind: "maybe-bounce" });
        continue;
      }

      let matched = null;
      for (const id of refIds) if (byMessageId.has(id)) matched = byMessageId.get(id);
      if (!matched && byEmail.has(fromAddr)) matched = byEmail.get(fromAddr);
      if (!matched && fromAddr.includes("@")) {
        const dom = fromAddr.split("@")[1];
        for (const [email, p] of byEmail) if (email.split("@")[1] === dom) matched = p;
      }
      if (!matched) continue;

      const ls = lastSend(matched);
      if (ls && base.date.getTime() < new Date(ls.sentAt).getTime() - 60_000) continue;
      candidates.push({ ...base, prospect: matched, kind: "reply" });
    }
  } finally {
    lock.release();
  }

  const replies = [];
  const acks = [];
  const bounces = [];
  try {
    lock = await client.getMailboxLock("INBOX");
    try {
      for (const cand of candidates) {
        const parsed = await downloadParsed(client, cand.uid);
        const text = parsed?.text || "";
        if (cand.kind === "maybe-bounce") {
          const hay = (text + " " + (parsed?.html || "")).toLowerCase();
          let hit = null;
          for (const [mid, p] of byMessageId) if (hay.includes(mid)) hit = p;
          if (!hit) for (const [email, p] of byEmail) if (hay.includes(email)) hit = p;
          if (hit) bounces.push({ prospect: hit, reason: (cand.subject || "Delivery failure").slice(0, 200) });
          continue;
        }
        const rec = {
          prospect: cand.prospect,
          at: cand.date.toISOString(),
          subject: cand.subject,
          from: cand.from,
          messageId: cand.messageId,
          snippet: cleanSnippet(text || cand.subject),
        };
        if (looksAutomated({ ...parsed, subject: cand.subject })) acks.push(rec);
        else replies.push(rec);
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  // --- persist changes ---
  const byId = new Map(all.map((p) => [p.id, p]));
  const touched = new Set();
  let classified = 0;
  for (const r of replies) {
    const p = byId.get(r.prospect.id);
    if (!p || TERMINAL.includes(p.status)) continue;
    if (p.replyMessageId && p.replyMessageId === r.messageId) continue;
    if (p.lastReplyAt && new Date(p.lastReplyAt) >= new Date(r.at)) continue;

    const unsub = looksLikeUnsubscribe(r.snippet);

    let analysis;
    if (!unsub && classified < MAX_CLASSIFY_PER_POLL) {
      classified++;
      try {
        analysis = await classifyReply({
          prospect: p,
          replyText: r.snippet,
          lastSentSubject: lastSend(p)?.subject,
        });
      } catch {
        /* best effort */
      }
    }
    if (unsub) analysis = { intent: "unsubscribe", confidence: 0.9, summary: "asked to be removed", suggestedReply: "" };

    // link the reply to the campaign/enrollment it belongs to, if any
    const enr = (
      await sql`select id, campaign_id from enrollments
               where prospect_id = ${p.id} order by enrolled_at desc limit 1`
    )[0];

    await applyReply(p.id, {
      at: r.at,
      snippet: r.snippet,
      messageId: r.messageId,
      analysis,
      campaignId: enr?.campaign_id,
      enrollmentId: enr?.id,
    });
    await stopEnrollmentsForProspect(p.id, unsub ? "unsubscribed" : "replied");
    if (unsub || analysis?.intent === "unsubscribe") {
      await sql`update prospects set status = 'unsubscribed', updated_at = now() where id = ${p.id}`;
      await suppress(p.email, "unsubscribe reply");
    }
    p.status = "replied";
    p.lastReplyAt = r.at;
    p.replyMessageId = r.messageId;
    touched.add(p.id);
  }
  for (const a of acks) {
    const p = byId.get(a.prospect.id);
    if (!p || TERMINAL.includes(p.status) || p.status === "replied") continue;
    if (p.autoAckMessageId === a.messageId) continue;
    await applyAutoAck(p.id, { at: a.at, snippet: a.snippet, messageId: a.messageId });
    p.autoAckMessageId = a.messageId;
  }
  for (const b of bounces) {
    const p = byId.get(b.prospect.id);
    if (!p || p.status === "replied" || TERMINAL.includes(p.status)) continue;
    await applyBounce(p.id, { reason: b.reason });
    await stopEnrollmentsForProspect(p.id, "bounced");
    await suppress(p.email, "hard bounce");
    p.status = "bounced";
    touched.add(p.id);
  }
  const ranAt = nowISO();
  await setMeta("lastPollAt", ranAt);

  const shape = (r) => ({
    id: r.prospect.id,
    business: r.prospect.business,
    at: r.at,
    from: r.from,
    subject: r.subject,
    snippet: r.snippet,
  });
  return {
    checked: active.length,
    scanned,
    replies: replies.filter((r) => touched.has(r.prospect.id)).map(shape),
    acks: acks.map(shape),
    bounces: bounces
      .filter((b) => touched.has(b.prospect.id))
      .map((b) => ({ id: b.prospect.id, business: b.prospect.business, reason: b.reason })),
    ranAt,
  };
}

async function downloadParsed(client, uid) {
  try {
    const dl = await client.download(uid, undefined, { uid: true });
    if (!dl?.content) return null;
    return await simpleParser(dl.content);
  } catch {
    return null;
  }
}

function cleanSnippet(text) {
  return String(text)
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => !/^\s*>/.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 400);
}
