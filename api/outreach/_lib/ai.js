// Claude calls for the AI layer: per-prospect email drafting, reply
// classification, and prospect enrichment. Raw fetch to the Anthropic API to
// match discover.js (no SDK dependency in the serverless bundle).

import { config } from "./config.js";
import { hookFor } from "./render.js";

const MODEL = "claude-sonnet-5";
const API = "https://api.anthropic.com/v1/messages";

/**
 * Master switch. All AI calls are no-ops unless OUTREACH_AI="on" AND a key is
 * set. Lets us ship the feature without spending any credits until Luis flips it.
 */
export function aiEnabled() {
  return process.env.OUTREACH_AI === "on" && !!process.env.ANTHROPIC_API_KEY;
}

function keyOrThrow() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
  return process.env.ANTHROPIC_API_KEY;
}

async function callClaude({ system, prompt, tools, effort = "low", maxTokens = 1500, timeoutMs = 45_000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let r;
  try {
    r = await fetch(API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": keyOrThrow(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        output_config: { effort },
        ...(system ? { system } : {}),
        ...(tools ? { tools } : {}),
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
  return { text, data };
}

function parseJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

// ─────────────────────────────── drafting ───────────────────────────────

const BRAND = `FC Cleaning Company Ltd — owner-managed commercial cleaning for
restaurants, pubs, bars, cafés and small hotels across Greater Manchester and
the North West. Fully insured; early-morning or post-close slots so work never
clashes with service; every job personally checked by the owner. Free written
quote within 24 hours. Sender: ${config.senderFirstName} (${config.senderTitle}).`;

/**
 * Draft one cold-outreach email for a prospect, tuned by the step's guidance.
 * Returns { subject, bodyCore } — bodyCore has NO sign-off; the caller appends
 * the standard footer.
 */
export async function draftEmail(prospect, step, { round = 1 } = {}) {
  if (!aiEnabled()) return null;
  const research = prospect.research
    ? `What we know about them (research):\n${JSON.stringify(prospect.research, null, 1)}`
    : `We have little research on them. Known: ${[
        prospect.location && `area: ${prospect.location}`,
        prospect.address && `address: ${prospect.address}`,
        prospect.website && `website: ${prospect.website}`,
        prospect.tags?.length && `tags: ${prospect.tags.join(", ")}`,
      ]
        .filter(Boolean)
        .join("; ") || "business name only"}.`;

  const stepContext =
    round === 1
      ? "This is the FIRST contact — they don't know us. Introduce briefly, be specific about why them, one clear ask (a quick look round / a quote)."
      : `This is follow-up #${round - 1}. Keep it short, reference the earlier email lightly, no guilt-trips, make it easy to say no.`;

  const guidance = step.aiGuidance
    ? `Extra direction for this step: ${step.aiGuidance}`
    : "";

  const system = `You write short, genuine cold outreach emails for a small cleaning business.
Plain text only. British English. 90–140 words. No greeting line with a name placeholder
(the caller adds "Hi <name>,"). No sign-off, no signature, no "Best," — the caller adds those.
Warm, direct, specific. No corporate filler, no "I hope this email finds you well",
no bullet lists, no links. One ask, phrased casually.`;

  const prompt = `${BRAND}

Prospect: ${prospect.business}${prospect.contactName ? ` (contact: ${prospect.contactName})` : ""}
${research}
Personalisation angle: ${hookFor(prospect)}

${stepContext}
${guidance}

Return ONLY a JSON object: {"subject": "...", "body": "..."}
- subject: 3–7 words, lowercase-ish, specific, not salesy
- body: the email body WITHOUT any greeting or sign-off (the caller wraps it)`;

  const { text } = await callClaude({ system, prompt, effort: "low", maxTokens: 900 });
  const j = parseJson(text) || {};
  const greeting = prospect.contactName
    ? `Hi ${prospect.contactName.split(/\s+/)[0]},`
    : "Hi there,";
  const bodyCore = `${greeting}\n\n${(j.body || "").trim()}`;
  return {
    subject: (j.subject || `Cleaning for ${prospect.business}`).trim(),
    bodyCore,
  };
}

// ─────────────────────────────── classification ───────────────────────────────

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

/**
 * Classify an inbound reply and draft a suggested response.
 * Returns { intent, confidence (0-1), summary, suggestedReply }.
 */
export async function classifyReply({ prospect, replyText, lastSentSubject }) {
  if (!aiEnabled()) return null;
  const system = `You triage replies to cold outreach for a small cleaning company and
draft a short, friendly response the owner can send with one tweak. British English,
plain text, no sign-off.`;

  const prompt = `Prospect: ${prospect.business}
Our last email subject: ${lastSentSubject || "(unknown)"}

Their reply:
"""
${String(replyText || "").slice(0, 4000)}
"""

Classify intent as ONE of: ${INTENTS.join(", ")}
- interested: wants a quote / to know more
- meeting: proposing or agreeing to a call/visit
- question: asking something before deciding
- not_now: maybe later / bad timing
- not_interested: a clear no
- referral: pointing us to someone else
- unsubscribe: asking to be removed / stop contact
- auto_reply: out-of-office / autoresponder
- other

Return ONLY JSON: {"intent":"...","confidence":0.0-1.0,"summary":"one line","suggestedReply":"a 2-4 sentence reply with no greeting and no sign-off, or empty string if no reply is warranted"}`;

  const { text } = await callClaude({ system, prompt, effort: "low", maxTokens: 700 });
  const j = parseJson(text) || {};
  const intent = INTENTS.includes(j.intent) ? j.intent : "other";
  return {
    intent,
    confidence: typeof j.confidence === "number" ? Math.max(0, Math.min(1, j.confidence)) : 0.5,
    summary: (j.summary || "").slice(0, 300),
    suggestedReply: (j.suggestedReply || "").slice(0, 2000),
  };
}

// ─────────────────────────────── enrichment ───────────────────────────────

/**
 * Research a prospect from their website + a web search. Returns a `research`
 * object to store on the prospect, plus a fresh `hook`.
 */
export async function enrichProspect(prospect) {
  if (!aiEnabled()) return null;
  const tools = [
    { type: "web_search_20260209", name: "web_search", max_uses: 3 },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 },
  ];
  const prompt = `Research this hospitality business so a cleaning company can write a
personalised outreach email. ${prospect.business}${
    prospect.location ? `, ${prospect.location}` : ""
  }${prospect.website ? ` — website ${prospect.website}` : ""}.

Use web search and fetch their site (Contact/About/Menu pages) to find:
- what they are (cuisine / venue type / style)
- rough size and service pattern (days open, brunch/late/club nights, covers, function/event space, kitchen scale, B&B rooms)
- anything that implies specific cleaning needs (extraction canopies, cellar, washrooms, high-turnover, outdoor seating)
- the best published contact (name + email) if visible

Return ONLY JSON:
{"summary":"2-3 sentences","venueType":"...","servicePattern":"...","cleaningNeeds":["..."],"bestContactName":"or null","bestContactEmail":"or null","hook":"a short lowercase NOUN PHRASE for the sentence 'I'm reaching out about ___.' — no leading article, no trailing period","confidence":0.0-1.0}`;

  const { text } = await callClaude({
    system: "You are a careful researcher. Never invent an email address — only report one you actually saw published.",
    prompt,
    tools,
    effort: "low",
    maxTokens: 1500,
    timeoutMs: 90_000,
  });
  const j = parseJson(text);
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
