import express from "express";
import cron from "node-cron";
import { join } from "node:path";
import { config, ROOT } from "./lib/config.mjs";
import {
  load,
  save,
  decorate,
  getProspect,
  upsertProspect,
  lastSend,
  nowISO,
} from "./lib/store.mjs";
import { sendMail, sendDigest, verify } from "./lib/mailer.mjs";
import { draftFollowUp, draftInitial } from "./lib/templates.mjs";
import { pollReplies } from "./lib/imap.mjs";

const app = express();
app.use(express.json({ limit: "1mb" }));

// --- auth: ?token=... sets a cookie, thereafter cookie or Bearer header -----
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
app.use((req, res, next) => {
  const q = req.query.token;
  const cookie = parseCookies(req).fc_outreach;
  const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const provided = q || cookie || bearer;
  if (provided !== config.token) {
    if (req.path.startsWith("/api/"))
      return res.status(401).json({ error: "unauthorized" });
    return res
      .status(401)
      .type("html")
      .send(
        `<meta name=viewport content="width=device-width,initial-scale=1"><body style="font:16px system-ui;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#0f172a">
         <h1 style="font-size:1.2rem">FC Outreach</h1>
         <p>Add your access token to the URL:</p>
         <p style="background:#f1f5f9;padding:.7rem;border-radius:.5rem;word-break:break-all"><code>?token=YOUR_TOKEN</code></p>
         <p style="color:#64748b;font-size:.9rem">The token is <code>DASHBOARD_TOKEN</code> in <code>outreach/.env</code>.</p></body>`,
      );
  }
  if (q && q === config.token) {
    res.setHeader(
      "Set-Cookie",
      `fc_outreach=${encodeURIComponent(q)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000`,
    );
  }
  next();
});

app.use(express.static(join(ROOT, "public")));

// --- API ------------------------------------------------------------------
app.get("/api/prospects", (req, res) => {
  const db = load();
  const prospects = db.prospects.map(decorate).sort((a, b) => {
    const rank = (s) =>
      ({ replied: 0, follow_up_due: 1, awaiting_reply: 2, draft: 3, bounced: 4 })[s] ?? 5;
    if (rank(a.effectiveStatus) !== rank(b.effectiveStatus))
      return rank(a.effectiveStatus) - rank(b.effectiveStatus);
    return (b.lastSendAt || "").localeCompare(a.lastSendAt || "");
  });
  const counts = {};
  for (const p of prospects) counts[p.effectiveStatus] = (counts[p.effectiveStatus] || 0) + 1;
  res.json({
    prospects,
    counts,
    total: prospects.length,
    lastPollAt: db.lastPollAt || null,
    config: {
      from: config.from.address,
      replyTo: config.replyTo,
      followUpIntervalDays: config.followUpIntervalDays,
    },
  });
});

app.get("/api/prospects/:id/draft", (req, res) => {
  const db = load();
  const p = getProspect(db, req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  const isInitial = !p.sends?.length;
  const round = (p.followUpsSent ?? 0) + 1;
  const draft = isInitial ? draftInitial(p) : draftFollowUp(p, round);
  res.json({ ...draft, kind: isInitial ? "initial" : "follow_up", round });
});

app.post("/api/prospects/:id/send", async (req, res) => {
  const db = load();
  const p = getProspect(db, req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  const { subject, text } = req.body || {};
  if (!subject || !text) return res.status(400).json({ error: "subject and text required" });

  const isInitial = !p.sends?.length;
  const prev = lastSend(p);
  const headers = {};
  if (prev?.messageId) {
    headers["In-Reply-To"] = prev.messageId;
    headers["References"] = [...(p.sends.map((s) => s.messageId))].join(" ");
  }

  try {
    const info = await sendMail({
      to: p.email,
      subject,
      text,
      headers,
      context: { prospectId: p.id, type: isInitial ? "initial" : "follow_up" },
    });
    p.sends.push({
      type: isInitial ? "initial" : "follow_up",
      subject,
      messageId: info.messageId,
      sentAt: nowISO(),
    });
    if (!isInitial) p.followUpsSent = (p.followUpsSent ?? 0) + 1;
    p.status = "awaiting_reply";
    p.updatedAt = nowISO();
    save(db);
    res.json({ ok: true, messageId: info.messageId, prospect: decorate(p) });
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
});

app.post("/api/prospects/:id/status", (req, res) => {
  const db = load();
  const p = getProspect(db, req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  const { status, notes } = req.body || {};
  const allowed = [
    "awaiting_reply",
    "replied",
    "bounced",
    "won",
    "lost",
    "unsubscribed",
    "draft",
  ];
  if (status && !allowed.includes(status))
    return res.status(400).json({ error: "bad status" });
  if (status) p.status = status;
  if (typeof notes === "string") p.notes = notes;
  p.updatedAt = nowISO();
  save(db);
  res.json({ ok: true, prospect: decorate(p) });
});

app.post("/api/prospects", (req, res) => {
  const { business, email } = req.body || {};
  if (!business || !email) return res.status(400).json({ error: "business and email required" });
  const db = load();
  const p = upsertProspect(db, req.body);
  save(db);
  res.json({ ok: true, prospect: decorate(p) });
});

app.post("/api/poll", async (req, res) => {
  try {
    // pollReplies() persists its own updates (including lastPollAt).
    res.json(await pollReplies());
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
});

// --- scheduled poll + digest -------------------------------------------------
async function scheduledRun() {
  try {
    const result = await pollReplies();
    await maybeSendDigest(result);
    log(`poll ok — ${result.replies.length} new replies, ${result.bounces.length} bounces`);
  } catch (err) {
    log(`poll FAILED — ${err.message}`);
  }
}

async function maybeSendDigest(pollResult) {
  if (!config.digestTo) return;
  const db = load();
  const due = db.prospects.map(decorate).filter((p) => p.effectiveStatus === "follow_up_due");
  if (!pollResult.replies.length && !pollResult.bounces.length && !due.length) return;

  const lines = [];
  if (pollResult.replies.length) {
    lines.push(`REPLIES (${pollResult.replies.length}):`);
    for (const r of pollResult.replies)
      lines.push(`  • ${r.business} — ${r.snippet.split("\n")[0].slice(0, 120)}`);
    lines.push("");
  }
  if (due.length) {
    lines.push(`FOLLOW-UPS DUE (${due.length}):`);
    for (const p of due)
      lines.push(`  • ${p.business} — ${p.daysSinceLastSend}d since last contact`);
    lines.push("");
  }
  if (pollResult.bounces.length) {
    lines.push(`BOUNCED (${pollResult.bounces.length}):`);
    for (const b of pollResult.bounces) lines.push(`  • ${b.business} — ${b.reason}`);
    lines.push("");
  }
  lines.push(`Open the dashboard to action these.`);
  await sendDigest({
    to: config.digestTo,
    subject: `FC Outreach — ${pollResult.replies.length} replies, ${due.length} follow-ups due`,
    text: lines.join("\n"),
  }).catch((e) => log(`digest send failed — ${e.message}`));
}

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`);
}

// --- boot ------------------------------------------------------------------
verify()
  .then(() => log("SMTP ok"))
  .catch((e) => log(`SMTP verify failed — ${e.message}`));

if (cron.validate(config.pollCron)) {
  cron.schedule(config.pollCron, scheduledRun);
  log(`scheduled poll: ${config.pollCron}`);
}

app.listen(config.port, config.host, () => {
  log(`FC Outreach on http://${config.host}:${config.port}  (append ?token=…)`);
});
