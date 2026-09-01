import { config } from "./config.js";
import { decorate } from "./store.js";
import { sendDigest } from "./mailer.js";

/**
 * Email a summary of new replies, follow-ups due and bounces.
 * `store` is the post-poll data; `pollResult` is what pollReplies returned.
 */
export async function maybeSendDigest(store, pollResult) {
  if (!config.digestTo) return { sent: false, reason: "no DIGEST_TO" };

  const due = store.prospects.map(decorate).filter((p) => p.effectiveStatus === "follow_up_due");
  const nothing =
    !pollResult.replies.length && !pollResult.bounces.length && !due.length;
  if (nothing) return { sent: false, reason: "nothing to report" };

  const lines = [];
  if (pollResult.replies.length) {
    lines.push(`REPLIES (${pollResult.replies.length}):`);
    for (const r of pollResult.replies)
      lines.push(`  • ${r.business} — ${(r.snippet || "").split("\n")[0].slice(0, 120)}`);
    lines.push("");
  }
  if (due.length) {
    lines.push(`FOLLOW-UPS DUE (${due.length}):`);
    for (const p of due) lines.push(`  • ${p.business} — ${p.daysSinceLastSend}d since last contact`);
    lines.push("");
  }
  if (pollResult.bounces.length) {
    lines.push(`BOUNCED (${pollResult.bounces.length}):`);
    for (const b of pollResult.bounces) lines.push(`  • ${b.business} — ${b.reason}`);
    lines.push("");
  }
  lines.push(`Open ${config.website}/ops to action these.`);

  await sendDigest({
    to: config.digestTo,
    subject: `FC Outreach — ${pollResult.replies.length} replies, ${due.length} follow-ups due`,
    text: lines.join("\n"),
  });
  return { sent: true };
}
