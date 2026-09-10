// Render a template against a real prospect — powers the live preview in the
// campaign step editor.

import { getProspect, listProspects } from "../_lib/prospects.js";
import { render, validate, MERGE_TOKENS } from "../_lib/render.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    // sample prospect + token list for the editor
    const sample = (await listProspects())[0] || null;
    return res.json({ tokens: MERGE_TOKENS, sample: sample && { id: sample.id, business: sample.business } });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method not allowed" });
  }

  const { subjectTmpl = "", bodyTmpl = "", prospectId } = req.body || {};
  let p;
  if (prospectId) p = await getProspect(prospectId);
  if (!p) p = (await listProspects())[0];
  if (!p) return res.status(400).json({ error: "no prospect to preview against" });

  const subject = render(subjectTmpl, p);
  const body = render(bodyTmpl, p);
  return res.json({
    prospect: { id: p.id, business: p.business, contactName: p.contactName },
    subject,
    body,
    unresolved: [...new Set([...validate(subject), ...validate(body)])],
  });
}
