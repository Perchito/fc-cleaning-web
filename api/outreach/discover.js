// Daily lead-research job (Vercel Cron -> see vercel.json). Uses Claude with
// the web_search / web_fetch server-side tools to find new hospitality-venue
// prospects with a genuinely published contact email, and adds them to the
// same Blob store the dashboard reads (status: draft, nothing sends
// automatically). Self-authenticated like cron.js — Vercel sends
// "Authorization: Bearer $CRON_SECRET" for every cron-triggered request.

import { load, save, upsertProspect } from "./_lib/store.js";
import { config as appConfig } from "./_lib/config.js";

const MODEL = "claude-sonnet-5";
const TARGET_COUNT = 5;
const MAX_ATTEMPTS = 8;
const DEADLINE_MS = 260_000; // stay under the 300s function limit
const PER_ATTEMPT_TIMEOUT_MS = 70_000; // cap one slow attempt so it can't sink the whole run

const TARGET_BRIEF = `You are researching new commercial-cleaning prospects for FC Cleaning
Company Ltd, an owner-managed cleaning business covering Greater Manchester
and the wider North West of England — Manchester city centre (Northern
Quarter, Deansgate, Spinningfields, MediaCityUK, Ancoats), Chorlton,
Didsbury, Salford, Bolton, Wigan, and the towns around Bolton/Wigan (Leigh,
Atherton, Westhoughton, Horwich, Standish, Ince-in-Makerfield,
Ashton-in-Makerfield, Farnworth). Specializing in restaurants, pubs, bars,
cafes and small hotels (kitchen deep cleans, extraction cleaning,
front-of-house, washrooms).`;

export default async function handler(req, res) {
  const auth = req.headers.authorization || "";
  if (appConfig.cronSecret && auth !== `Bearer ${appConfig.cronSecret}`) {
    return res.status(401).json({ error: "unauthorized" });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const startedAt = Date.now();
  try {
    const db = await load();
    const existingNames = db.prospects.map((p) => p.business);
    const added = [];
    let attempts = 0;

    while (
      added.length < TARGET_COUNT &&
      attempts < MAX_ATTEMPTS &&
      Date.now() - startedAt < DEADLINE_MS
    ) {
      attempts++;
      // Ask for a small batch per attempt, not the full remaining count —
      // asking for more in one call is what made a single attempt run long
      // enough to blow the whole function's time budget.
      const remaining = Math.min(2, TARGET_COUNT - added.length);
      const timeLeft = DEADLINE_MS - (Date.now() - startedAt);
      const attemptTimeout = Math.min(PER_ATTEMPT_TIMEOUT_MS, timeLeft);

      let leads = [];
      try {
        leads = await researchLeads(existingNames, remaining, attemptTimeout);
      } catch (err) {
        if (err?.name === "AbortError") break; // this attempt ran long — stop and save what we have
        throw err;
      }

      let addedThisAttempt = 0;
      for (const lead of leads) {
        if (added.length >= TARGET_COUNT) break;
        if (!lead?.business || !lead?.email) continue;
        const dupe = existingNames.some(
          (n) => n.toLowerCase() === String(lead.business).toLowerCase()
        );
        if (dupe) continue;
        const p = upsertProspect(db, { ...lead, source: "ai-research" });
        added.push({ id: p.id, business: p.business, location: p.location || null });
        existingNames.push(lead.business);
        addedThisAttempt++;
      }

      // Nothing new this round — further attempts are unlikely to help
      // (area's verified-email supply is exhausted for today); stop rather
      // than burn API calls for no gain.
      if (addedThisAttempt === 0) break;
    }

    if (added.length) await save(db);

    return res.json({ ok: true, added, attempts, target: TARGET_COUNT });
  } catch (err) {
    return res.status(502).json({ error: String(err?.message || err) });
  }
}

async function researchLeads(existingNames, count, timeoutMs) {
  const prompt = [
    TARGET_BRIEF,
    "",
    `Find up to ${count} independently or small-group owned hospitality`,
    "venues across those areas that are NOT already in this list of",
    "existing prospects:",
    JSON.stringify(existingNames),
    "",
    "Spread your search across different areas and venue types rather than",
    "focusing on just one town — the goal is genuinely new candidates, not",
    "exhaustively covering a single place.",
    "",
    "For each candidate, use web search and, where useful, fetch their",
    "website to find a genuine PUBLISHED contact email (a mailto: link or",
    "an email shown on a Contact/About page). Only include a business if",
    "you found a real email this way — never guess or invent one (e.g. do",
    "not construct info@domain unless you actually saw that exact address",
    "published).",
    "",
    "Respond with ONLY a JSON array (no prose, no markdown fences) of up",
    `to ${count} objects, each with these keys: business, email, contactName`,
    "(or null), address (or null), location (the area/neighbourhood), phone",
    "(or null), website (or null), hook, notes.",
    "",
    "IMPORTANT — `hook` grammar: it is inserted verbatim into the sentence",
    '"I\'m reaching out about ${hook}." — so it must be a short NOUN PHRASE,',
    "NOT a full sentence. Start lowercase, no leading article like \"A\"/\"An\"",
    'used as a sentence-opener, and no trailing period. Good examples:',
    '"the kitchen, cellar and bar-floor cleaning at the Bay Horse Tavern",',
    '"a before-open front-of-house clean given the seven-day brunch-to-late',
    'service", "scheduled deep cleans of the guest bathrooms, bar area and',
    'event spaces around high-turnover bookings". Base it on specifics you',
    "found (cuisine, service hours, size, event space, etc). `notes` is",
    "separate — one plain sentence citing what you found and where.",
    "",
    `If you can't verify ${count} with real emails, return fewer — never`,
    "fabricate a business or an email.",
    "",
    "Work efficiently — this runs under a time limit. Do one focused search",
    "per candidate area rather than many broad ones, and fetch only the",
    "single page on each site most likely to list an email (Contact/About)",
    "rather than crawling the whole site.",
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        output_config: { effort: "low" },
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: 4 },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4 },
        ],
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!r.ok) throw new Error(`Anthropic API ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]);
  } catch {
    return [];
  }
}
