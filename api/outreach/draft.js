import { load, getProspect } from "./_lib/store.js";
import { draftInitial, draftFollowUp } from "./_lib/templates.js";

export default async function handler(req, res) {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "id required" });
  const db = await load();
  const p = getProspect(db, id);
  if (!p) return res.status(404).json({ error: "not found" });

  const isInitial = !p.sends?.length;
  const round = (p.followUpsSent ?? 0) + 1;
  const draft = isInitial ? draftInitial(p) : draftFollowUp(p, round);
  return res.json({ ...draft, kind: isInitial ? "initial" : "follow_up", round });
}
