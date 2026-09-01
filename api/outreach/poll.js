import { pollReplies } from "./_lib/imap.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  try {
    return res.json(await pollReplies());
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
}
