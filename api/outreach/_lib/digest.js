import { config } from "./config.js";
import { decorate } from "./prospects.js";
import { sendDigest } from "./mailer.js";
import { sql } from "./db.js";

/**
 * Email a summary of new replies, the batch waiting for approval, follow-ups
 * due, and bounces. `store` is the post-poll data; `pollResult` is what
 * pollReplies returned.
 */
export async function maybeSendDigest(store, pollResult) {
  if (!config.digestTo) return { sent: false, reason: "no DIGEST_TO" };

  const replies = pollResult.replies || [];
  const bounces = pollResult.bounces || [];
  const due = store.prospects.map(decorate).filter((p) => p.effectiveStatus === "follow_up_due");

  const [{ queued }] = await sql`
    select count(*)::int as queued from sends where status in ('queued','approved')`;
  const [{ open_replies }] = await sql`
    select count(*)::int as open_replies from events where type = 'reply' and handled = false`;

  const nothing = !replies.length && !bounces.length && !due.length && !queued && !open_replies;
  if (nothing) return { sent: false, reason: "nothing to report" };

  const lines = [];
  if (queued) {
    lines.push(`${queued} email${queued === 1 ? "" : "s"} queued — review and approve in /ops.`, "");
  }
  if (replies.length || open_replies) {
    lines.push(`REPLIES — ${open_replies} awaiting you${replies.length ? ` (${replies.length} new)` : ""}:`);
    for (const r of replies)
      lines.push(`  • ${r.business} — ${(r.snippet || "").split("\n")[0].slice(0, 120)}`);
    lines.push("");
  }
  if (due.length) {
    lines.push(`FOLLOW-UPS DUE (${due.length}):`);
    for (const p of due) lines.push(`  • ${p.business} — ${p.daysSinceLastContact}d since last contact`);
    lines.push("");
  }
  if (bounces.length) {
    lines.push(`BOUNCED (${bounces.length}):`);
    for (const b of bounces) lines.push(`  • ${b.business} — ${b.reason}`);
    lines.push("");
  }
  lines.push(`${config.website}/ops`);

  await sendDigest({
    to: config.digestTo,
    subject: `FC Outreach — ${queued} to approve, ${open_replies} replies`,
    text: lines.join("\n"),
  });
  return { sent: true };
}
