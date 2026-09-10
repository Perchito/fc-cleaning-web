// The reply inbox: classified inbound replies with a suggested response, plus
// bounces / auto-acks. Actions: mark handled, send a reply, set status.

import { sql } from "../_lib/db.js";
import { getProspect, setStatus, lastSend } from "../_lib/prospects.js";
import { sendMail } from "../_lib/mailer.js";
import { suppress } from "../_lib/suppression.js";
import { classifyReply } from "../_lib/ai.js";

function row(r) {
  return {
    id: r.id,
    prospectId: r.prospect_id,
    business: r.business,
    email: r.email,
    campaignId: r.campaign_id,
    campaignName: r.campaign_name,
    type: r.type,
    intent: r.intent,
    at: r.at,
    subject: r.subject,
    snippet: r.snippet,
    messageId: r.message_id,
    handled: r.handled,
    confidence: r.meta?.confidence ?? null,
    summary: r.meta?.summary ?? null,
    suggestedReply: r.meta?.suggested_reply ?? null,
    prospectStatus: r.prospect_status,
  };
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const openOnly = (req.query.filter || "open") === "open";
    const rows = await sql.query(
      `select ev.*, p.business, p.email, p.status as prospect_status, c.name as campaign_name
       from events ev
       join prospects p on p.id = ev.prospect_id
       left join campaigns c on c.id = ev.campaign_id
       where ev.type in ('reply','bounce','auto_ack')
         ${openOnly ? "and ev.handled = false" : ""}
       order by ev.at desc
       limit 200`,
    );
    return res.json({ items: rows.map(row) });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method not allowed" });
  }

  const { eventId, action, text, status } = req.body || {};
  if (!eventId || !action) return res.status(400).json({ error: "eventId and action required" });
  const [ev] = await sql`select * from events where id = ${eventId}`;
  if (!ev) return res.status(404).json({ error: "event not found" });
  const p = await getProspect(ev.prospect_id);
  if (!p) return res.status(404).json({ error: "prospect not found" });

  if (action === "mark_handled") {
    await sql`update events set handled = true where id = ${eventId}`;
    return res.json({ ok: true });
  }

  if (action === "set_status") {
    await setStatus(ev.prospect_id, { status });
    if (status === "unsubscribed") await suppress(p.email, "manual (from inbox)");
    await sql`update events set handled = true where id = ${eventId}`;
    return res.json({ ok: true });
  }

  if (action === "regenerate") {
    try {
      const a = await classifyReply({
        prospect: p,
        replyText: ev.snippet,
        lastSentSubject: lastSend(p)?.subject,
      });
      await sql`
        update events set intent = ${a.intent},
          meta = meta || ${JSON.stringify({
            confidence: a.confidence,
            summary: a.summary,
            suggested_reply: a.suggestedReply,
          })}::jsonb
        where id = ${eventId}`;
      return res.json({ ok: true, intent: a.intent, suggestedReply: a.suggestedReply, summary: a.summary });
    } catch (err) {
      return res.status(502).json({ error: String(err.message || err) });
    }
  }

  if (action === "send_reply") {
    if (!text?.trim()) return res.status(400).json({ error: "text required" });
    const prev = lastSend(p);
    const headers = {};
    if (ev.message_id) {
      headers["In-Reply-To"] = `<${String(ev.message_id).replace(/^<|>$/g, "")}>`;
    } else if (prev?.messageId) {
      headers["In-Reply-To"] = prev.messageId;
    }
    const subject = ev.subject?.match(/^re:/i) ? ev.subject : `Re: ${ev.subject || "your message"}`;
    try {
      const info = await sendMail({ to: p.email, subject, text, headers });
      await sql`
        insert into events (prospect_id, campaign_id, type, subject, message_id)
        values (${ev.prospect_id}, ${ev.campaign_id}, 'sent', ${subject}, ${info.messageId})`;
      await sql`update events set handled = true where id = ${eventId}`;
      return res.json({ ok: true, messageId: info.messageId });
    } catch (err) {
      return res.status(502).json({ error: String(err.message || err) });
    }
  }

  return res.status(400).json({ error: "unknown action" });
}
