#!/usr/bin/env node
// FC Home Server — control panel.
// A small web GUI (no dependencies beyond `pg` from the repo) for running the
// outreach stack on the Ubuntu box: service status + start/stop/restart, logs,
// host health, database stats, backups/restore, Neon import, a file store,
// settings (the env file) and "update from GitHub".
//
// Runs as the app user (see install.sh). Service control goes through
// `sudo -n systemctl …`, which install.sh allows for the fc-* units only.

import http from "node:http";
import os from "node:os";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const SCRIPTS = resolve(HERE, "../scripts");
const PUBLIC = join(HERE, "public");

const ENV_FILE = process.env.ENV_FILE || "/etc/fc-outreach/outreach.env";
const PORT = Number(process.env.PANEL_PORT || 8090);
const HOST = process.env.PANEL_HOST || "0.0.0.0";
const PASS = process.env.PANEL_PASS || "";
const STORAGE = resolve(process.env.STORAGE_DIR || "/srv/fc-outreach/storage");
const FILES = join(STORAGE, "files");
const BACKUPS = join(STORAGE, "backups");
const APP_PORT = Number(process.env.PORT || 4517);

// Units the panel may control. `optional` ones are shown only if installed.
const UNITS = [
  { unit: "fc-outreach-app", label: "Outreach app", desc: "Dashboard (/ops) + API + daily jobs" },
  { unit: "fc-outreach-worker", label: "AI worker", desc: "Runs AI jobs through Claude Code" },
  { unit: "postgresql", label: "PostgreSQL", desc: "Outreach database" },
  { unit: "fc-outreach-backup.timer", label: "Nightly backup", desc: "pg_dump to storage at 03:00" },
  { unit: "cloudflared", label: "Cloudflare Tunnel", desc: "Public HTTPS access", optional: true },
  { unit: "tailscaled", label: "Tailscale", desc: "Private remote access", optional: true },
];
const UNIT_NAMES = new Set(UNITS.map((u) => u.unit));
const SECRET_KEYS = /PASS|SECRET|KEY|TOKEN|DATABASE_URL/i;

if (!PASS) {
  console.error(`PANEL_PASS is not set in ${ENV_FILE} — refusing to start an unprotected panel.`);
  process.exit(1);
}

// ─────────────────────────────── sessions ───────────────────────────────
const SESSION_KEY = crypto.randomBytes(32); // sessions end when the panel restarts
const SESSION_TTL = 7 * 24 * 3600 * 1000;

function sign(payload) {
  const mac = crypto.createHmac("sha256", SESSION_KEY).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}
function validSession(req) {
  const m = (req.headers.cookie || "").match(/(?:^|;\s*)fcpanel=([^;]+)/);
  if (!m) return false;
  const [payload, mac] = m[1].split(".");
  if (!payload || !mac) return false;
  const good = sign(payload).split(".")[1];
  if (mac.length !== good.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return false;
  return Number(payload) > Date.now();
}
function passwordOk(given) {
  const a = crypto.createHash("sha256").update(String(given || "")).digest();
  const b = crypto.createHash("sha256").update(PASS).digest();
  return crypto.timingSafeEqual(a, b);
}

// ─────────────────────────────── helpers ───────────────────────────────
async function sh(cmd, args, opts = {}) {
  try {
    const { stdout, stderr } = await exec(cmd, args, { timeout: 120_000, maxBuffer: 16 * 1024 * 1024, ...opts });
    return { ok: true, out: (stdout + (stderr ? `\n${stderr}` : "")).trim() };
  } catch (e) {
    return { ok: false, out: `${e.stdout || ""}${e.stderr || ""}`.trim() || e.message };
  }
}

async function readJson(req, limit = 1024 * 1024) {
  let raw = "";
  for await (const c of req) {
    raw += c;
    if (raw.length > limit) throw Object.assign(new Error("body too large"), { status: 413 });
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw Object.assign(new Error("invalid JSON"), { status: 400 });
  }
}

function send(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

// Resolve a user-supplied path inside `base`, refusing anything that escapes it.
function inside(base, rel = "") {
  const p = resolve(base, "." + sep + String(rel).replace(/^[/\\]+/, ""));
  if (p !== base && !p.startsWith(base + sep)) throw Object.assign(new Error("bad path"), { status: 400 });
  return p;
}

async function parseEnvFile() {
  let text = "";
  try {
    text = await readFile(ENV_FILE, "utf8");
  } catch {
    /* missing → empty */
  }
  return text.split("\n");
}

function envValue(v) {
  v = v.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
}

async function dbClient() {
  const env = {};
  for (const line of await parseEnvFile()) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/);
    if (m) env[m[1]] = envValue(m[2]);
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: env.DATABASE_URL || process.env.DATABASE_URL });
  await client.connect();
  return client;
}

// ─────────────────────────────── data sources ───────────────────────────────
async function unitStatus(u) {
  const r = await sh("systemctl", [
    "show",
    u.unit,
    "--property=LoadState,ActiveState,SubState,ActiveEnterTimestamp,MemoryCurrent,NRestarts,UnitFileState",
  ]);
  const p = Object.fromEntries(
    r.out
      .split("\n")
      .map((l) => l.split("="))
      .filter((a) => a.length >= 2)
      .map(([k, ...v]) => [k, v.join("=")]),
  );
  const mem = Number(p.MemoryCurrent);
  return {
    ...u,
    installed: p.LoadState === "loaded",
    active: p.ActiveState,
    sub: p.SubState,
    enabled: p.UnitFileState,
    since: p.ActiveEnterTimestamp || null,
    memory: Number.isFinite(mem) && mem < 2 ** 60 ? mem : null,
    restarts: Number(p.NRestarts) || 0,
  };
}

async function overview() {
  const [services, df, health, ts, osr] = await Promise.all([
    Promise.all(UNITS.map(unitStatus)),
    sh("df", ["-B1", "--output=target,size,used,avail", "/", STORAGE]),
    fetch(`http://127.0.0.1:${APP_PORT}/healthz`, { signal: AbortSignal.timeout(3000) })
      .then((r) => r.json())
      .catch(() => null),
    sh("tailscale", ["ip", "-4"]),
    readFile("/etc/os-release", "utf8").catch(() => ""),
  ]);
  const disks = [];
  const seen = new Set();
  for (const line of df.ok ? df.out.split("\n").slice(1) : []) {
    const [target, size, used, avail] = line.trim().split(/\s+/);
    if (!target || seen.has(target)) continue;
    seen.add(target);
    disks.push({ target, size: +size, used: +used, avail: +avail });
  }
  const nets = Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal)
    .map((n) => n.address);
  return {
    host: {
      hostname: os.hostname(),
      os: (osr.match(/PRETTY_NAME="([^"]+)"/) || [])[1] || `${os.type()} ${os.release()}`,
      uptime: os.uptime(),
      load: os.loadavg(),
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || "",
      memTotal: os.totalmem(),
      memFree: os.freemem(),
      ips: nets,
      tailscale: ts.ok ? ts.out.split("\n")[0] : null,
    },
    disks,
    services: services.filter((s) => s.installed || !s.optional),
    app: { port: APP_PORT, health },
    opsUrl: process.env.OPS_PUBLIC_URL || null,
  };
}

async function dbInfo() {
  const c = await dbClient();
  try {
    const [{ rows: v }, { rows: size }, { rows: tables }, { rows: conns }] = await Promise.all([
      c.query("select current_setting('server_version') as version, current_database() as db"),
      c.query("select pg_database_size(current_database())::bigint as bytes"),
      c.query(`select relname as name, pg_total_relation_size(relid)::bigint as bytes
               from pg_stat_user_tables order by relname`),
      c.query("select count(*)::int as n from pg_stat_activity where datname = current_database()"),
    ]);
    for (const t of tables) {
      const { rows } = await c.query(`select count(*)::int as n from "${t.name.replace(/"/g, '""')}"`);
      t.rows = rows[0].n;
      t.bytes = Number(t.bytes);
    }
    let pending = null;
    try {
      pending = (await c.query("select status, count(*)::int as n from ai_jobs group by status")).rows;
    } catch {
      /* table may not exist yet */
    }
    return { ...v[0], bytes: Number(size[0].bytes), connections: conns[0].n, tables, aiJobs: pending };
  } finally {
    await c.end();
  }
}

async function listBackups() {
  await mkdir(BACKUPS, { recursive: true });
  const out = [];
  for (const name of await readdir(BACKUPS)) {
    if (!name.endsWith(".sql.gz")) continue;
    const s = await stat(join(BACKUPS, name));
    out.push({ name, bytes: s.size, at: s.mtime });
  }
  return out.sort((a, b) => b.at - a.at);
}

async function listFiles(rel) {
  await mkdir(FILES, { recursive: true });
  const dir = inside(FILES, rel);
  const entries = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const s = await stat(join(dir, d.name)).catch(() => null);
    if (!s) continue;
    entries.push({ name: d.name, dir: d.isDirectory(), bytes: s.size, at: s.mtime });
  }
  entries.sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name));
  const total = await sh("du", ["-sb", STORAGE]);
  return { path: dir.slice(FILES.length) || "/", entries, storageBytes: total.ok ? Number(total.out.split(/\s/)[0]) : null };
}

async function settings() {
  const lines = await parseEnvFile();
  const items = [];
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/);
    if (!m) continue;
    const secret = SECRET_KEYS.test(m[1]);
    const value = envValue(m[2]);
    items.push({ key: m[1], secret, set: value !== "", value: secret ? "" : value });
  }
  return { file: ENV_FILE, items };
}

async function saveSettings(changes) {
  const lines = await parseEnvFile();
  const pending = new Map(Object.entries(changes || {}).filter(([k]) => /^[A-Z0-9_]+$/.test(k)));
  for (const [k, v] of pending) {
    if (/[\r\n]/.test(String(v))) throw Object.assign(new Error(`${k}: value can't contain a newline`), { status: 400 });
  }
  const out = lines.map((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (!m || !pending.has(m[1])) return line;
    const v = String(pending.get(m[1]));
    pending.delete(m[1]);
    return `${m[1]}=${v}`;
  });
  while (out.length && out[out.length - 1] === "") out.pop();
  for (const [k, v] of pending) out.push(`${k}=${v}`);
  const tmp = `${ENV_FILE}.tmp`;
  await writeFile(tmp, out.join("\n") + "\n", { mode: 0o600 });
  await rename(tmp, ENV_FILE);
}

async function runDaily(name) {
  const env = {};
  for (const line of await parseEnvFile()) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/);
    if (m) env[m[1]] = envValue(m[2]);
  }
  // cron/discover authenticate with CRON_SECRET; poll sits behind the Basic-auth gate
  const authorization =
    name === "poll"
      ? `Basic ${Buffer.from(`${env.OPS_USER || "fc"}:${env.OPS_PASS || ""}`).toString("base64")}`
      : `Bearer ${env.CRON_SECRET || ""}`;
  const r = await fetch(`http://127.0.0.1:${APP_PORT}/api/outreach/${name}`, {
    method: name === "poll" ? "POST" : "GET",
    headers: { authorization },
    signal: AbortSignal.timeout(300_000),
  });
  const text = await r.text();
  let body = text;
  try {
    body = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    /* keep raw */
  }
  return { ok: r.ok, out: `HTTP ${r.status}\n${body}` };
}

// ─────────────────────────────── routes ───────────────────────────────
const svcAction = (unit, action) => sh("sudo", ["-n", "systemctl", action, unit]);

async function api(req, res, url) {
  const p = url.pathname.replace(/^\/api/, "");
  const m = req.method;

  if (p === "/overview" && m === "GET") return send(res, 200, await overview());

  let r;
  if ((r = p.match(/^\/services\/([\w.@-]+)\/(start|stop|restart|enable|disable)$/)) && m === "POST") {
    if (!UNIT_NAMES.has(r[1])) return send(res, 400, { error: "unknown service" });
    const out = await svcAction(r[1], r[2]);
    return send(res, out.ok ? 200 : 500, out);
  }
  if ((r = p.match(/^\/logs\/([\w.@-]+)$/)) && m === "GET") {
    if (!UNIT_NAMES.has(r[1])) return send(res, 400, { error: "unknown service" });
    const n = Math.min(2000, Math.max(20, Number(url.searchParams.get("lines")) || 300));
    const unit = r[1].replace(/\.timer$/, ".service");
    return send(res, 200, await sh("journalctl", ["-u", unit, "-n", String(n), "--no-pager", "-o", "short-iso"]));
  }

  if (p === "/db" && m === "GET") {
    try {
      return send(res, 200, await dbInfo());
    } catch (e) {
      return send(res, 200, { error: e.message });
    }
  }
  if (p === "/db/import-neon" && m === "POST") {
    const { url: neonUrl } = await readJson(req);
    if (!/^postgres(ql)?:\/\//.test(neonUrl || "")) return send(res, 400, { error: "paste a postgresql:// connection string" });
    const out = await sh(join(SCRIPTS, "import-from-neon.sh"), [neonUrl], { timeout: 900_000 });
    return send(res, out.ok ? 200 : 500, out);
  }

  if (p === "/backups" && m === "GET") return send(res, 200, { backups: await listBackups() });
  if (p === "/backups" && m === "POST") {
    const out = await sh(join(SCRIPTS, "backup.sh"), [], { timeout: 900_000 });
    return send(res, out.ok ? 200 : 500, out);
  }
  if (p === "/backups/restore" && m === "POST") {
    const { name } = await readJson(req);
    const file = inside(BACKUPS, basename(name || ""));
    const out = await sh(join(SCRIPTS, "restore.sh"), [file], { timeout: 900_000 });
    return send(res, out.ok ? 200 : 500, out);
  }
  if (p === "/backups/download" && m === "GET") {
    return download(res, inside(BACKUPS, basename(url.searchParams.get("name") || "")));
  }
  if (p === "/backups" && m === "DELETE") {
    await rm(inside(BACKUPS, basename(url.searchParams.get("name") || "")));
    return send(res, 200, { ok: true });
  }

  if (p === "/files" && m === "GET") return send(res, 200, await listFiles(url.searchParams.get("path") || ""));
  if (p === "/files/download" && m === "GET") return download(res, inside(FILES, url.searchParams.get("path")));
  if (p === "/files/upload" && m === "POST") {
    const dir = inside(FILES, url.searchParams.get("path") || "");
    const name = basename(url.searchParams.get("name") || "");
    if (!name || name.startsWith(".")) return send(res, 400, { error: "bad file name" });
    const dest = inside(dir, name);
    await mkdir(dir, { recursive: true });
    await pipeline(req, createWriteStream(`${dest}.part`));
    await rename(`${dest}.part`, dest);
    return send(res, 200, { ok: true });
  }
  if (p === "/files/mkdir" && m === "POST") {
    const { path: rel, name } = await readJson(req);
    if (!name || /[/\\]/.test(name) || name.startsWith(".")) return send(res, 400, { error: "bad folder name" });
    await mkdir(inside(inside(FILES, rel || ""), name), { recursive: true });
    return send(res, 200, { ok: true });
  }
  if (p === "/files" && m === "DELETE") {
    const target = inside(FILES, url.searchParams.get("path"));
    if (target === FILES) return send(res, 400, { error: "can't delete the storage root" });
    await rm(target, { recursive: true });
    return send(res, 200, { ok: true });
  }

  if ((r = p.match(/^\/jobs\/(cron|discover|poll)$/)) && m === "POST") return send(res, 200, await runDaily(r[1]));

  if (p === "/settings" && m === "GET") return send(res, 200, await settings());
  if (p === "/settings" && m === "POST") {
    const { changes, restart } = await readJson(req);
    await saveSettings(changes);
    let out = { ok: true, out: "saved" };
    if (restart) {
      const a = await svcAction("fc-outreach-app", "restart");
      const w = await svcAction("fc-outreach-worker", "restart");
      out = { ok: a.ok && w.ok, out: `saved; app ${a.ok ? "restarted" : a.out}; worker ${w.ok ? "restarted" : w.out}` };
    }
    return send(res, 200, out);
  }

  if (p === "/update" && m === "POST") {
    const out = await sh(join(SCRIPTS, "update.sh"), [], { timeout: 900_000, cwd: REPO });
    return send(res, out.ok ? 200 : 500, out);
  }
  if (p === "/version" && m === "GET") {
    const out = await sh("git", ["-C", REPO, "log", "-1", "--format=%h %s (%cr)"]);
    const br = await sh("git", ["-C", REPO, "rev-parse", "--abbrev-ref", "HEAD"]);
    return send(res, 200, { commit: out.out, branch: br.out });
  }

  return send(res, 404, { error: "not found" });
}

function download(res, file) {
  return stat(file)
    .then((s) => {
      if (!s.isFile()) throw new Error();
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": s.size,
        "Content-Disposition": `attachment; filename="${basename(file).replace(/"/g, "")}"`,
      });
      createReadStream(file).pipe(res);
    })
    .catch(() => send(res, 404, { error: "file not found" }));
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

async function serveStatic(res, pathname) {
  const file = inside(PUBLIC, pathname === "/" ? "index.html" : pathname);
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}

let failedLogins = 0;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  try {
    if (url.pathname === "/login" && req.method === "POST") {
      const { password } = await readJson(req);
      if (!passwordOk(password)) {
        failedLogins++;
        await new Promise((r) => setTimeout(r, Math.min(10_000, 500 * failedLogins)));
        return send(res, 401, { error: "wrong password" });
      }
      failedLogins = 0;
      const token = sign(String(Date.now() + SESSION_TTL));
      res.setHeader("Set-Cookie", `fcpanel=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}`);
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/logout") {
      res.setHeader("Set-Cookie", "fcpanel=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
      return send(res, 200, { ok: true });
    }
    if (url.pathname.startsWith("/api/")) {
      if (!validSession(req)) return send(res, 401, { error: "login required" });
      // CSRF: state-changing calls must come from our own JS (custom header can't be sent cross-site without CORS)
      if (req.method !== "GET" && req.headers["x-fc-panel"] !== "1") return send(res, 403, { error: "forbidden" });
      return await api(req, res, url);
    }
    return await serveStatic(res, url.pathname);
  } catch (e) {
    console.error(req.method, url.pathname, e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.message });
    else res.end();
  }
});

server.listen(PORT, HOST, () => console.log(`FC Home Server panel on http://${HOST}:${PORT}`));
