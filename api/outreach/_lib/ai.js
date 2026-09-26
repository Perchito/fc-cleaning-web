// The AI layer. Two backends, chosen by env:
//   AI_BACKEND=worker  → enqueue an ai_jobs row; the home Claude Code worker
//                        runs it on the Claude subscription (no API credits)
//   otherwise          → call the Anthropic API directly (pay-per-token)
// Master switch OUTREACH_AI must be "on" for either.
//
// This file exposes: prompt-spec builders (pure), result normalisers (pure),
// runViaApi(spec), and the classic sync helpers used by the API path.

import { config } from "./config.js";
import { hookFor, withFooter } from "./render.js";
import { sql } from "./db.js";

const MODEL = "claude-sonnet-5";
const API = "https://api.anthropic.com/v1/messages";

const IN_RATE = 2 / 1_000_000;
const OUT_RATE = 10 / 1_000_000;
const SEARCH_RATE = 10 / 1000;

export const INTENTS = [
  "interested",
  "meeting",
  "question",
  "not_now",
  "not_interested",
  "referral",
  "unsubscribe",
  "auto_reply",
  "other",
];

// ─────────────────────────────── switches ───────────────────────────────

export function aiEnabled() {
  return process.env.OUTREACH_AI === "on";
}

/** "worker" | "api" | "off" */
export function aiBackend() {
  if (!aiEnabled()) return "off";
  if (process.env.AI_BACKEND === "worker") return "worker";
  return process.env.ANTHROPIC_API_KEY ? "api" : "off";
}

// ── daily spend cap (only meaningful for the API backend) ──
const DAILY_BUDGET_USD = Number(process.env.AI_DAILY_BUDGET_USD || 2);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

export async function aiSpendToday() {
  const rows = await sql`select v from meta where k = 'aiSpend'`;
  const rec = rows[0]?.v;
  return rec && rec.day === today()
    ? { day: rec.day, usd: rec.usd || 0, calls: rec.calls || 0 }
    : { day: today(), usd: 0, calls: 0 };
}
export async function recordAiSpend(usd) {
  const s = await aiSpendToday();
  const next = { day: s.day, usd: Math.round((s.usd + usd) * 1e6) / 1e6, calls: s.calls + 1 };
  await sql`
    insert into meta (k, v) values ('aiSpend', ${JSON.stringify(next)}::jsonb)
    on conflict (k) do update set v = excluded.v`;
  return next;
}
export async function aiBudgetOk() {
  if (aiBackend() === "worker") return true; // subscription, not metered here
  return (await aiSpendToday()).usd < DAILY_BUDGET_USD;
}
export function aiCostOf(data) {
  const u = data?.usage || {};
  const searches = u.server_tool_use?.web_search_requests || 0;
  return (
    (u.input_tokens || 0) * IN_RATE +
    (u.cache_creation_input_tokens || 0) * IN_RATE +
    (u.output_tokens || 0) * OUT_RATE +
    searches * SEARCH_RATE
  );
}

// ─────────────────────────────── API call ───────────────────────────────

function webTools() {
  return [
    { type: "web_search_20260209", name: "web_search", max_uses: 2 },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 2, max_content_tokens: 3000 },
  ];
}

function parseJson(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/** Run a prompt spec against the Anthropic API. Returns parsed JSON (expect
 *  'json') or { text }. Returns null on failure. */
export async function runViaApi(spec) {
  if (aiBackend() !== "api") return null;
  if (!(await aiBudgetOk())) {
    console.warn(`[ai] daily budget $${DAILY_BUDGET_USD} reached`);
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), spec.web ? 90_000 : 45_000);
  let r;
  try {
    r = await fetch(API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: spec.maxTokens || 900,
        output_config: { effort: "low" },
        system: spec.system,
        ...(spec.web ? { tools: webTools() } : {}),
        messages: [{ role: "user", content: spec.prompt }],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
  if (!r.ok) return null;
  const data = await r.json();
  try {
    await recordAiSpend(aiCostOf(data));
  } catch {
    /* metering must not break the call */
  }
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return spec.expect === "json" ? parseJson(text) : { text };
}

// ─────────────────────────────── prompt specs ───────────────────────────────

const BRAND = `FC Cleaning Company Ltd — owner-managed commercial cleaning for
restaurants, pubs, bars, cafés and small hotels across Greater Manchester and
the North West. Fully insured; early-morning or post-close slots so work never
clashes with service; every job personally checked by the owner. Free written
quote within 24 hours. Sender: ${config.senderFirstName} (${config.senderTitle}).`;

export function draftSpec(prospect, step = {}, { round = 1 } = {}) {
  const research = prospect.research
    ? `What we know about them (research):\n${JSON.stringify(prospect.research, null, 1)}`
    : `Little research. Known: ${
        [
          prospect.location && `area: ${prospect.location}`,
          prospect.address && `address: ${prospect.address}`,
          prospect.website && `website: ${prospect.website}`,
          prospect.tags?.length && `tags: ${prospect.tags.join(", ")}`,
        ]
          .filter(Boolean)
          .join("; ") || "business name only"
      }.`;
  const stepContext =
    round === 1
      ? "FIRST contact — they don't know us. Introduce briefly, be specific about why them, one clear ask."
      : `Follow-up #${round - 1}. Short, reference the earlier email lightly, no guilt-trips, easy to say no.`;
  const first = prospect.contactName ? prospect.contactName.split(/\s+/)[0] : "there";

  return {
    kind: "draft",
    expect: "json",
    web: false,
    maxTokens: 900,
    system: `You write short, genuine cold outreach emails for a small cleaning business.
Plain text only. British English. 90–140 words in the body. Start with "Hi ${first},".
No sign-off / signature — the caller appends that. Warm, direct, specific.
No corporate filler, no "I hope this email finds you well", no bullet lists, no links. One ask.`,
    prompt: `${BRAND}

Prospect: ${prospect.business}${prospect.contactName ? ` (contact: ${prospect.contactName})` : ""}
${research}
Personalisation angle: ${hookFor(prospect)}

${stepContext}
${step.aiGuidance ? `Extra direction: ${step.aiGuidance}` : ""}

Return ONLY JSON: {"subject":"3–7 words, specific, not salesy","body":"the full email starting with the greeting, no sign-off"}`,
  };
}

export function normDraft(j, prospect) {
  if (!j) return null;
  const body = String(j.body || "").trim();
  if (!body) return null;
  return {
    subject: String(j.subject || `Cleaning for ${prospect.business}`).trim(),
    body: withFooter(body, prospect),
  };
}

export function classifySpec({ prospect, replyText, lastSentSubject }) {
  return {
    kind: "classify",
    expect: "json",
    web: false,
    maxTokens: 700,
    system: `You triage replies to cold outreach for a small cleaning company and draft a
short friendly response the owner can send with one tweak. British English, plain text, no sign-off.`,
    prompt: `Prospect: ${prospect.business}
Our last email subject: ${lastSentSubject || "(unknown)"}

Their reply:
"""
${String(replyText || "").slice(0, 4000)}
"""

Classify intent as ONE of: ${INTENTS.join(", ")}
Return ONLY JSON: {"intent":"...","confidence":0.0-1.0,"summary":"one line","suggestedReply":"2-4 sentences, no greeting, no sign-off, or \\"\\" if no reply is warranted"}`,
  };
}

export function normClassify(j) {
  j = j || {};
  return {
    intent: INTENTS.includes(j.intent) ? j.intent : "other",
    confidence: typeof j.confidence === "number" ? Math.max(0, Math.min(1, j.confidence)) : 0.5,
    summary: String(j.summary || "").slice(0, 300),
    suggestedReply: String(j.suggestedReply || "").slice(0, 2000),
  };
}

export function enrichSpec(prospect) {
  return {
    kind: "enrich",
    expect: "json",
    web: true,
    maxTokens: 1500,
    system:
      "You are a careful researcher. Never invent an email address — only report one you actually saw published.",
    prompt: `Research this hospitality business so a cleaning company can write a personalised
outreach email. ${prospect.business}${prospect.location ? `, ${prospect.location}` : ""}${
      prospect.website ? ` — website ${prospect.website}` : ""
    }.

Use web search and fetch their site (Contact/About/Menu). Find: what they are; rough size and
service pattern (days open, brunch/late/club nights, covers, function/event space, kitchen
scale, B&B rooms); anything implying specific cleaning needs (extraction canopies, cellar,
washrooms, high turnover, outdoor seating); the best published contact.

Return ONLY JSON: {"summary":"2-3 sentences","venueType":"...","servicePattern":"...","cleaningNeeds":["..."],"bestContactName":"or null","bestContactEmail":"or null","hook":"a short lowercase NOUN PHRASE for 'I'm reaching out about ___.' — no leading article, no trailing period","confidence":0.0-1.0}`,
  };
}

export function discoverSpec({ area, count = 3, existingNames = [] }) {
  return {
    kind: "discover",
    expect: "json",
    web: true,
    maxTokens: 3000,
    system:
      "You are a careful lead researcher for a commercial cleaning company. Never invent a business or an email — only include a venue where you found a genuinely published contact email (a mailto: link or an address shown on a Contact/About page).",
    prompt: `Find up to ${count} independently or small-group owned hospitality venues (restaurants,
pubs, bars, cafés, small hotels) around ${area || "Bolton and the North West"} that are NOT already
in this list:
${JSON.stringify(existingNames)}

For each, use web search and fetch the Contact/About page to confirm a real published email.
Return ONLY a JSON object: {"leads":[{"business":"","email":"","contactName":null,"address":"","location":"","phone":null,"website":"","hook":"lowercase noun phrase for 'I'm reaching out about ___.'","notes":"one sentence citing what you found and where"}]}
If you can't verify ${count}, return fewer. Never fabricate.`,
  };
}

export function normEnrich(j) {
  if (!j) return null;
  return {
    research: {
      summary: j.summary || "",
      venueType: j.venueType || "",
      servicePattern: j.servicePattern || "",
      cleaningNeeds: Array.isArray(j.cleaningNeeds) ? j.cleaningNeeds : [],
      bestContactName: j.bestContactName || null,
      bestContactEmail: j.bestContactEmail || null,
      confidence: typeof j.confidence === "number" ? j.confidence : null,
    },
    hook: j.hook || null,
  };
}

// ─────────────── classic sync helpers (API backend only) ───────────────

export async function draftEmail(prospect, step, opts) {
  if (aiBackend() !== "api") return null;
  return normDraft(await runViaApi(draftSpec(prospect, step, opts)), prospect);
}
export async function classifyReply(args) {
  if (aiBackend() !== "api") return null;
  const j = await runViaApi(classifySpec(args));
  return j ? normClassify(j) : null;
}
export async function enrichProspect(prospect) {
  if (aiBackend() !== "api") return null;
  return normEnrich(await runViaApi(enrichSpec(prospect)));
}
