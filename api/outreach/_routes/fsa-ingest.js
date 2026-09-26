// FSA Food Hygiene Ratings ingest. Runs as a Vercel Cron (daily 08:00 UTC)
// and can also be called by your server's daily.sh with the same secret.
//
// Pulls establishments for the configured local authorities, keeps the ones
// worth pitching (low ratings need help; "AwaitingInspection" = opening soon),
// and upserts them as draft prospects with fsa_* fields + a tag. Emails are
// NOT invented — FSA doesn't publish them — so these enter with a placeholder
// skip until the Research/enrich step finds a real contact.
//
// Auth: "Authorization: Bearer $CRON_SECRET" (same as cron.js / discover.js).
//
// Config (env):
//   FSA_AUTHORITY_IDS  comma-separated local authority IDs, e.g. "805,806"
//                      Find yours: GET api.ratings.food.gov.uk/Authorities/basic
//                      (805 = North East Lincolnshire / Grimsby area)
//   FSA_MIN_RATING     ratings to include: "0,1,2" plus awaiting (default)
//   FSA_MAX_PER_RUN    cap on new prospects per run (default 40)

import { sql } from "../_lib/db.js";

const FSA_BASE = "https://api.ratings.food.gov.uk";
const KEEP_TYPES = /restaurant|caf|canteen|pub|bar|takeaway|hotel|cater|mobile|care|school|club/i;

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

async function fsa(path) {
  const r = await fetch(FSA_BASE + path, { headers: { "x-api-version": "2" } });
  if (!r.ok) throw new Error(`FSA ${r.status} for ${path}`);
  return r.json();
}

export default async function handler(req, res) {
  const auth = req.headers.authorization || "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorised" });
  }

  const ids = (process.env.FSA_AUTHORITY_IDS || "805")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const keepRatings = new Set(
    (process.env.FSA_MIN_RATING || "0,1,2,AwaitingInspection").split(",").map((s) => s.trim()),
  );
  const maxNew = Number(process.env.FSA_MAX_PER_RUN || 40);

  const summary = { authorities: [], added: 0, updated: 0, skipped: 0, errors: [] };

  for (const id of ids) {
    let page = 1;
    let pages = 1;
    while (page <= pages) {
      let body;
      try {
        body = await fsa(`/Establishments?localAuthorityId=${id}&pageSize=1000&pageNumber=${page}`);
      } catch (e) {
        summary.errors.push(`authority ${id}: ${e.message}`);
        break;
      }
      const ests = body.establishments || [];
      pages = Math.min(body.meta?.totalPages || 1, 5); // hard cap: 5k per authority
      if (page === 1) summary.authorities.push({ id, establishments: ests.length });

      for (const e of ests) {
        if (!KEEP_TYPES.test(e.BusinessType || "")) { summary.skipped++; continue; }
        if (!keepRatings.has(String(e.RatingValue))) { summary.skipped++; continue; }
        if (summary.added >= maxNew) break;

        const name = (e.BusinessName || "").trim();
        if (!name) { summary.skipped++; continue; }
        const address = [e.AddressLine2, e.AddressLine3, e.AddressLine4].filter(Boolean).join(", ");
        const ratingDate = (e.RatingDate || "").slice(0, 10) || null;
        const hook =
          e.RatingValue === "AwaitingInspection"
            ? "Opening soon — first hygiene inspection still to come"
            : `FSA hygiene rating ${e.RatingValue}/5` + (ratingDate ? ` (inspected ${ratingDate})` : "");

        try {
          // Dedupe on fhrs_id first (same venue re-inspected), then name+postcode.
          const existing = await sql`
            select id, status from prospects
            where fhrs_id = ${e.FHRSID}
               or (business = ${name} and coalesce(address,'') = coalesce(${address},''))
            limit 1`;

          if (existing[0]) {
            await sql`
              update prospects set
                fsa_rating = ${String(e.RatingValue)},
                fsa_rating_date = ${ratingDate},
                updated_at = now()
              where id = ${existing[0].id}`;
            summary.updated++;
            continue;
          }

          const pid = `fsa-${e.FHRSID}`;
          await sql`
            insert into prospects
              (id, business, email, source, address, location, phone, website,
               hook, tags, notes, status, fhrs_id, fsa_rating, fsa_rating_date)
            values (
              ${pid}, ${name}, ${`${slugify(name)}-${e.FHRSID}@fsa.pending`},
              'fsa', ${address || null}, ${e.PostCode || null}, ${e.Phone || null}, null,
              ${hook}, ${["fsa", (e.BusinessType || "").toLowerCase()]}, ${e.BusinessType || ""}, 'draft',
              ${e.FHRSID}, ${String(e.RatingValue)}, ${ratingDate}
            )
            on conflict (id) do update set
              fsa_rating = excluded.fsa_rating,
              fsa_rating_date = excluded.fsa_rating_date,
              updated_at = now()`;
          summary.added++;
        } catch (err) {
          summary.errors.push(`${name}: ${err.message}`);
        }
      }
      page++;
    }
  }

  return res.json({ ok: true, ...summary });
}
