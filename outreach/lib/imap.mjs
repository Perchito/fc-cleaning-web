// Poll the iCloud inbox and reconcile replies / bounces against sent mail.
//
// Matching strategy, most reliable first:
//   1. Threading headers — the inbound message's In-Reply-To / References
//      contains a Message-ID we logged for that prospect.
//   2. From address — the message is from the prospect's email (or same
//      domain), dated at/after our last send to them.
//   3. Bounce — message from a mailer-daemon/postmaster that quotes one of
//      our Message-IDs or the prospect's address.
//
// imapflow serialises commands on a connection: you cannot issue a
// download() while a fetch() iterator is still open. So this runs in two
// passes — collect candidate UIDs during the fetch, then download bodies
// for just those after the iterator closes.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { config } from "./config.mjs";
import { load, save, lastSend, nowISO } from "./store.mjs";

const TERMINAL = ["replied", "won", "lost", "unsubscribed"];

function normId(s) {
  return String(s || "").trim().replace(/^<|>$/g, "").toLowerCase();
}
function idsFromHeader(value) {
  return String(value || "").split(/\s+/).map(normId).filter(Boolean);
}

// RFC 3834 + common vendor headers + subject tells for auto-acknowledgements
// and out-of-office. These are "your mail landed" signals, not real answers,
// so they don't count as a reply and don't stop the follow-up clock.
const AUTO_SUBJECT =
  /\b(out of office|auto(?:matic)?[-\s]?reply|automatic response|thanks for (?:your (?:message|email|e-mail|enquiry|inquiry)|contacting)|we(?:'ve| have) received your)/i;

function looksAutomated(parsed) {
  if (!parsed) return false;
  const h = parsed.headers || new Map();
  const get = (k) => String(h.get(k) || "").toLowerCase();
  const autoSubmitted = get("auto-submitted");
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (h.has("x-autoreply") || h.has("x-autorespond") || h.has("x-auto-response-suppress"))
    return true;
  const precedence = get("precedence");
  if (["auto_reply", "bulk", "junk", "list"].includes(precedence)) return true;
  if (AUTO_SUBJECT.test(parsed.subject || "")) return true;
  return false;
}

export async function pollReplies({ sinceDays = 45 } = {}) {
  const db = load();
  const active = db.prospects.filter((p) => !TERMINAL.includes(p.status) && p.sends?.length);
  if (!active.length) return { checked: 0, replies: [], bounces: [], scanned: 0, ranAt: nowISO() };

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
    greetingTimeout: 15000,
    socketTimeout: 60000,
  });

  let scanned = 0;
  const candidates = []; // { uid, prospect, kind: "reply"|"maybe-bounce", date, subject, from, messageId }

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    // --- pass 1: identify candidate messages (no downloads here) ---
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
        /mail delivery|undeliverable|delivery status notification|returned mail|failure notice/i.test(
          subject,
        );
      if (daemon) {
        candidates.push({ ...base, prospect: null, kind: "maybe-bounce" });
        continue;
      }

      let matched = null;
      for (const id of refIds) if (byMessageId.has(id)) matched = byMessageId.get(id);
      if (!matched && byEmail.has(fromAddr)) matched = byEmail.get(fromAddr);
      if (!matched && fromAddr.includes("@")) {
        const dom = fromAddr.split("@")[1];
        for (const [email, p] of byEmail)
          if (email.split("@")[1] === dom) matched = p;
      }
      if (!matched) continue;

      const ls = lastSend(matched);
      if (ls && base.date.getTime() < new Date(ls.sentAt).getTime() - 60_000) continue;
      candidates.push({ ...base, prospect: matched, kind: "reply" });
    }
  } finally {
    lock.release();
  }

  // --- pass 2: download bodies for candidates only ---
  const replies = [];
  const acks = []; // auto-acknowledgements / out-of-office
  const bounces = [];
  try {
    const lock2 = await client.getMailboxLock("INBOX");
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
      lock2.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  // --- apply ---
  const fresh = load();
  const touched = new Set();
  for (const r of replies) {
    const p = fresh.prospects.find((x) => x.id === r.prospect.id);
    if (!p || TERMINAL.includes(p.status)) continue;
    if (p.replyMessageId && p.replyMessageId === r.messageId) continue;
    if (p.lastReplyAt && new Date(p.lastReplyAt) >= new Date(r.at)) continue;
    p.status = "replied";
    p.lastReplyAt = r.at;
    p.replySnippet = r.snippet;
    p.replyMessageId = r.messageId;
    p.updatedAt = nowISO();
    touched.add(p.id);
  }
  // Auto-acks: record as delivery confirmation only — status is untouched.
  for (const a of acks) {
    const p = fresh.prospects.find((x) => x.id === a.prospect.id);
    if (!p || TERMINAL.includes(p.status) || p.status === "replied") continue;
    if (p.autoAckMessageId === a.messageId) continue;
    p.autoAckAt = a.at;
    p.autoAckSnippet = a.snippet;
    p.autoAckMessageId = a.messageId;
    p.updatedAt = nowISO();
  }
  for (const b of bounces) {
    const p = fresh.prospects.find((x) => x.id === b.prospect.id);
    if (!p || p.status === "replied" || TERMINAL.includes(p.status)) continue;
    p.status = "bounced";
    p.bounceReason = b.reason;
    p.updatedAt = nowISO();
    touched.add(p.id);
  }
  fresh.lastPollAt = nowISO();
  save(fresh);

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
    ranAt: nowISO(),
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
