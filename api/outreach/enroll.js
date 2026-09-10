import { enrollProspects, unenroll } from "./_lib/campaigns.js";

export default async function handler(req, res) {
  if (req.method === "POST") {
    const { campaignId, prospectIds } = req.body || {};
    if (!campaignId || !Array.isArray(prospectIds) || !prospectIds.length)
      return res.status(400).json({ error: "campaignId and prospectIds[] required" });
    const result = await enrollProspects(campaignId, prospectIds);
    if (result.error) return res.status(404).json(result);
    return res.json({ ok: true, ...result });
  }

  if (req.method === "DELETE") {
    const { enrollmentId } = req.body || {};
    if (!enrollmentId) return res.status(400).json({ error: "enrollmentId required" });
    await unenroll(enrollmentId);
    return res.json({ ok: true });
  }

  res.setHeader("Allow", "POST, DELETE");
  return res.status(405).json({ error: "method not allowed" });
}
