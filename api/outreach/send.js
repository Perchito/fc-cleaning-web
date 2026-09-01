import { load, save, getProspect, decorate, lastSend, nowISO } from "./_lib/store.js";
import { sendMail } from "./_lib/mailer.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  const { id, subject, text } = req.body || {};
  if (!id || !subject || !text)
    return res.status(400).json({ error: "id, subject and text required" });

  const db = await load();
  const p = getProspect(db, id);
  if (!p) return res.status(404).json({ error: "not found" });

  const isInitial = !p.sends?.length;
  const prev = lastSend(p);
  const headers = {};
  if (prev?.messageId) {
    headers["In-Reply-To"] = prev.messageId;
    headers["References"] = p.sends.map((s) => s.messageId).join(" ");
  }

  try {
    const info = await sendMail({ to: p.email, subject, text, headers });
    p.sends.push({
      type: isInitial ? "initial" : "follow_up",
      subject,
      messageId: info.messageId,
      sentAt: nowISO(),
    });
    if (!isInitial) p.followUpsSent = (p.followUpsSent ?? 0) + 1;
    p.status = "awaiting_reply";
    p.updatedAt = nowISO();
    await save(db);
    return res.json({ ok: true, messageId: info.messageId, prospect: decorate(p) });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
}
