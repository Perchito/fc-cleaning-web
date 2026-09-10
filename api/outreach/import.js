// CSV import. POST { csv: "<raw text>", campaignId?: "..." }.
// Auto-maps common column names. Skips rows with no email / no business, and
// prospects that already exist or are suppressed. Optionally enrols the new
// ones into a campaign.

import { sql } from "./_lib/db.js";
import { upsertProspect } from "./_lib/prospects.js";
import { enrollProspects } from "./_lib/campaigns.js";

// tiny CSV parser: handles quoted fields, embedded commas, "" escapes, CRLF
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let q = false;
  const s = String(text).replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const MAP = {
  business: ["business", "company", "name", "venue", "restaurant", "pub", "cafe"],
  email: ["email", "e-mail", "email address", "contact email"],
  contactName: ["contact", "contact name", "contactname", "person", "owner", "manager"],
  phone: ["phone", "tel", "telephone", "mobile", "number"],
  website: ["website", "url", "site", "web"],
  location: ["location", "area", "town", "city", "neighbourhood", "neighborhood"],
  address: ["address", "street", "full address", "postal address"],
};

function resolveHeader(headers) {
  const lower = headers.map((h) => h.trim().toLowerCase());
  const idx = {};
  for (const [field, names] of Object.entries(MAP)) {
    const i = lower.findIndex((h) => names.includes(h));
    if (i !== -1) idx[field] = i;
  }
  return idx;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  const { csv, campaignId } = req.body || {};
  if (!csv || typeof csv !== "string")
    return res.status(400).json({ error: "csv text required" });

  const rows = parseCSV(csv);
  if (rows.length < 2) return res.status(400).json({ error: "need a header row + at least one data row" });

  const headers = rows[0];
  const idx = resolveHeader(headers);
  if (idx.business === undefined || idx.email === undefined)
    return res.status(400).json({
      error: "could not find a business/company column and an email column",
      headersSeen: headers,
    });

  const existing = new Set(
    (await sql`select email from prospects`).map((r) => r.email.toLowerCase()),
  );
  const suppressed = new Set((await sql`select email from suppression`).map((r) => r.email));

  const added = [];
  const skipped = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const get = (f) => (idx[f] !== undefined ? (r[idx[f]] || "").trim() : "");
    const business = get("business");
    const email = get("email").toLowerCase();
    if (!business || !email || !email.includes("@")) {
      skipped.push({ row: i + 1, reason: "missing business or valid email" });
      continue;
    }
    if (existing.has(email) || suppressed.has(email)) {
      skipped.push({ row: i + 1, reason: existing.has(email) ? "already a prospect" : "suppressed" });
      continue;
    }
    const p = await upsertProspect({
      business,
      email,
      contactName: get("contactName") || undefined,
      phone: get("phone") || undefined,
      website: get("website") || undefined,
      location: get("location") || undefined,
      address: get("address") || undefined,
      source: "csv import",
    });
    existing.add(email);
    added.push(p.id);
  }

  let enrolled = null;
  if (campaignId && added.length) {
    enrolled = await enrollProspects(campaignId, added);
  }

  return res.json({ ok: true, added: added.length, addedIds: added, skipped, enrolled });
}
