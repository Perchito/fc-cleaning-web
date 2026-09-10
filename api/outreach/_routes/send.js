import { getProspect, recordSend, decorate, lastSend, nowISO } from "../_lib/prospects.js";
import { sendMail } from "../_lib/mailer.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  const { id, subject, text } = req.body || {};
  if (!id || !subject || !text)
    return res.status(400).json({ error: "id, subject and text required" });

  const p = await getProspect(id);
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
    const updated = await recordSend(id, {
      subject,
      messageId: info.messageId,
      sentAt: nowISO(),
      isInitial,
    });
    return res.json({ ok: true, messageId: info.messageId, prospect: decorate(updated) });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
}
