#!/usr/bin/env node
// FC Outreach — home worker.
// Runs on an always-on machine. Polls the site for AI jobs, runs each one
// through headless Claude Code (your Claude subscription — no API credits),
// posts the answer back. Outbound HTTPS only; nothing connects in.
//
//   SITE_URL=https://www.fccleaningcompany.com \
//   WORKER_SECRET=xxxxxxxx \
//   node worker/outreach-worker.mjs
//
// Requires: node 18+, the `claude` CLI installed and logged in (`claude login`).

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const SITE = (process.env.SITE_URL || "https://www.fccleaningcompany.com").replace(/\/$/, "");
const SECRET = process.env.WORKER_SECRET;
const POLL_MS = Number(process.env.POLL_MS || 8000);
const CLAUDE = process.env.CLAUDE_BIN || "claude";

if (!SECRET) {
  console.error("Set WORKER_SECRET (must match the value in Vercel).");
  process.exit(1);
}

const api = (path, opts = {}) =>
  fetch(`${SITE}/api/outreach${path}`, {
    ...opts,
    headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}`, ...opts.headers },
  });

function extractJson(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

async function runJob(job) {
  const args = ["-p", job.prompt, "--output-format", "json"];
  if (job.system) args.push("--append-system-prompt", job.system);
  args.push("--allowedTools", job.web ? "WebSearch,WebFetch" : "");

  const { stdout } = await run(CLAUDE, args, {
    timeout: job.web ? 300_000 : 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });

  let result = stdout;
  try {
    const parsed = JSON.parse(stdout);
    result = parsed.result ?? parsed.text ?? stdout;
  } catch {
    /* not JSON envelope — use raw */
  }

  return job.expect === "json" ? extractJson(result) : { text: String(result).trim() };
}

async function tick() {
  let jobs;
  try {
    const r = await api("/jobs?limit=4");
    if (!r.ok) {
      console.error(`poll ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return;
    }
    jobs = (await r.json()).jobs || [];
  } catch (e) {
    console.error("poll failed:", e.message);
    return;
  }

  for (const job of jobs) {
    const t0 = Date.now();
    try {
      const output = await runJob(job);
      if (output == null) throw new Error("no parseable output from Claude Code");
      await api("/jobs", { method: "POST", body: JSON.stringify({ id: job.id, output }) });
      console.log(`✓ ${job.kind} ${job.id.slice(0, 8)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    } catch (e) {
      await api("/jobs", {
        method: "POST",
        body: JSON.stringify({ id: job.id, error: String(e.message || e).slice(0, 500) }),
      }).catch(() => {});
      console.error(`✗ ${job.kind} ${job.id.slice(0, 8)}: ${e.message}`);
    }
  }
}

console.log(`FC Outreach worker → ${SITE}  (poll every ${POLL_MS / 1000}s)`);
// simple loop; never overlap ticks
(async function loop() {
  for (;;) {
    await tick().catch((e) => console.error("tick error:", e.message));
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
})();
