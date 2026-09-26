#!/usr/bin/env node
// FC Outreach — self-hosted app server for the Ubuntu home server.
// Serves the same things Vercel does for the outreach section, from this box:
//   /ops, /ops/*          the dashboard (static build in dist/ops)
//   /api/outreach/*       the API (the exact Vercel handlers in api/outreach)
//   /healthz              liveness + DB check (unauthenticated, no data)
// plus the daily jobs Vercel Cron used to run (cron + discover).
// Auth mirrors middleware.js: HTTP Basic (OPS_USER / OPS_PASS), with the same
// self-authenticated exceptions (cron, discover, worker job polling).
//
// Env is loaded by systemd from /etc/fc-outreach/outreach.env (see install.sh).

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const OPS_DIR = join(ROOT, "dist/ops");
const PORT = Number(process.env.PORT || 4517);
const HOST = process.env.HOST || "0.0.0.0";
const DAILY_AT = process.env.DAILY_AT || "08:00"; // local time in DAILY_TZ
const DAILY_TZ = process.env.DAILY_TZ || "Europe/London";
const DAILY_JOBS = (process.env.DAILY_JOBS ?? "cron,discover").split(",").map((s) => s.trim()).filter(Boolean);

const { default: outreach } = await import(join(ROOT, "api/outreach/[[...path]].js"));
const { sql } = await import(join(ROOT, "api/outreach/_lib/db.js"));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// ─────────────────────────────── auth (= middleware.js) ───────────────────────────────
function needsAuth(pathname, searchParams) {
  if (pathname === "/api/outreach/cron") return false;
  if (pathname === "/api/outreach/discover") return false;
  if (pathname === "/api/outreach/jobs" && !searchParams.get("id")) return false;
  return pathname === "/ops" || pathname.startsWith("/ops/") || pathname.startsWith("/api/outreach/");
}

// Brute-force guard (the dashboard can be public, e.g. via Tailscale Funnel, where every
// request arrives from the local proxy, so no per-IP limits): a login header that already
// passed is let through at once; any other one is checked at most once per second across
// all clients, so guessing is capped at ~1 try/s without ever locking the owner out.
const CHECK_EVERY_MS = 1000;
const knownGood = new Set(); // exact Authorization headers that passed (env changes restart the process)
let nextCheckAt = 0;

/** "ok" | "no" (send the login prompt) | "slow" (another check ran within the last second) */
function authorised(req) {
  const user = (process.env.OPS_USER || "fc").trim();
  const pass = (process.env.OPS_PASS || "").trim();
  const header = req.headers.authorization || "";
  if (!pass || !header.startsWith("Basic ")) return "no";
  if (knownGood.has(header)) return "ok";
  const now = Date.now();
  if (now < nextCheckAt) return "slow";
  nextCheckAt = now + CHECK_EVERY_MS;
  const decoded = Buffer.from(header.slice(6), "base64").toString();
  const i = decoded.indexOf(":");
  if (i > -1 && decoded.slice(0, i).trim() === user && decoded.slice(i + 1).trim() === pass) {
    if (knownGood.size > 50) knownGood.clear();
    knownGood.add(header);
    return "ok";
  }
  const from = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?").split(",")[0].trim();
  console.warn(`[auth] wrong /ops login from ${from}`);
  return "no";
}

// ─────────────────────────────── Vercel-style req/res ───────────────────────────────
async function readBody(req, limit = 5 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error("body too large"), { status: 413 });
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString();
  if (!raw) return undefined;
  if ((req.headers["content-type"] || "").includes("application/json")) {
    try {
      return JSON.parse(raw);
    } catch {
      throw Object.assign(new Error("invalid JSON body"), { status: 400 });
    }
  }
  return raw;
}

function vercelify(req, res, url) {
  req.query = Object.fromEntries(url.searchParams);
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    if (!res.headersSent) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = (body) => {
    if (typeof body === "object" && !Buffer.isBuffer(body)) return res.json(body);
    res.end(body);
    return res;
  };
}

// ─────────────────────────────── static /ops ───────────────────────────────
async function serveOps(pathname, res) {
  const rel = normalize(pathname.replace(/^\/ops\/?/, "")).replace(/^(\.\.[/\\])+/, "");
  let file = join(OPS_DIR, rel);
  if (!file.startsWith(OPS_DIR)) file = join(OPS_DIR, "index.html");
  try {
    if (!(await stat(file)).isFile()) throw new Error();
  } catch {
    file = join(OPS_DIR, "index.html"); // SPA fallback
  }
  try {
    const body = await readFile(file);
    const ext = extname(file);
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", rel.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-store");
    res.end(body);
  } catch {
    res.statusCode = 503;
    res.end("Dashboard not built yet — run `npm run build:ops` in the repo.");
  }
}

// ─────────────────────────────── server ───────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const { pathname } = url;

  if (pathname === "/healthz") {
    let db = false;
    try {
      await sql`select 1`;
      db = true;
    } catch {
      /* reported below */
    }
    res.statusCode = db ? 200 : 503;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: db, db, uptime: Math.round(process.uptime()) }));
  }

  const auth = needsAuth(pathname, url.searchParams) ? authorised(req) : "ok";
  if (auth === "slow") {
    res.writeHead(429, { "Retry-After": "1", "Cache-Control": "no-store" });
    return res.end("Too many login attempts — wait a second and try again.");
  }
  if (auth === "no") {
    res.writeHead(401, {
      "WWW-Authenticate": 'Basic realm="FC Outreach", charset="UTF-8"',
      "Cache-Control": "no-store",
    });
    return res.end("Authentication required.");
  }

  if (pathname === "/" || pathname === "") {
    res.writeHead(302, { Location: "/ops" });
    return res.end();
  }
  if (pathname === "/ops" || pathname.startsWith("/ops/")) return serveOps(pathname, res);

  if (pathname.startsWith("/api/outreach/")) {
    vercelify(req, res, url);
    try {
      req.body = await readBody(req);
      await outreach(req, res);
    } catch (err) {
      console.error(`${req.method} ${pathname}:`, err);
      if (!res.headersSent) res.status(err.status || 500).json({ error: String(err.message || err) });
      else res.end();
    }
    return;
  }

  res.statusCode = 404;
  res.end("Not found");
});

// ─────────────────────────────── daily jobs (replaces Vercel Cron) ───────────────────────────────
function localNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: DAILY_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export async function runDailyJob(name) {
  const t0 = Date.now();
  const r = await fetch(`http://127.0.0.1:${PORT}/api/outreach/${name}`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET || ""}` },
  });
  const body = await r.text();
  console.log(`[daily] ${name} → ${r.status} in ${((Date.now() - t0) / 1000).toFixed(0)}s ${body.slice(0, 300)}`);
}

let lastDailyRun = null;
setInterval(async () => {
  const { date, time } = localNow();
  if (time < DAILY_AT || lastDailyRun === date) return;
  // only fire in the first hour after DAILY_AT, so a restart at 23:00 doesn't trigger a late run
  const [h, m] = DAILY_AT.split(":").map(Number);
  const [nh, nm] = time.split(":").map(Number);
  if (nh * 60 + nm - (h * 60 + m) > 60) {
    lastDailyRun = date;
    return;
  }
  lastDailyRun = date;
  for (const job of DAILY_JOBS) await runDailyJob(job).catch((e) => console.error(`[daily] ${job} failed:`, e.message));
}, 30_000).unref();

server.listen(PORT, HOST, () => {
  console.log(`FC Outreach app on http://${HOST}:${PORT}/ops  (daily jobs ${DAILY_JOBS.join("+") || "off"} at ${DAILY_AT} ${DAILY_TZ})`);
});
