import {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
} from "./_lib/campaigns.js";

export default async function handler(req, res) {
  const id = req.query.id;

  if (req.method === "GET") {
    if (id) {
      const c = await getCampaign(id);
      if (!c) return res.status(404).json({ error: "not found" });
      return res.json({ campaign: c });
    }
    return res.json({ campaigns: await listCampaigns() });
  }

  if (req.method === "POST") {
    const c = await createCampaign(req.body || {});
    return res.json({ ok: true, campaign: c });
  }

  if (req.method === "PATCH" || req.method === "PUT") {
    if (!id) return res.status(400).json({ error: "id required" });
    const existing = await getCampaign(id);
    if (!existing) return res.status(404).json({ error: "not found" });
    const c = await updateCampaign(id, req.body || {});
    return res.json({ ok: true, campaign: c });
  }

  res.setHeader("Allow", "GET, POST, PATCH");
  return res.status(405).json({ error: "method not allowed" });
}
