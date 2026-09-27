#!/usr/bin/env node
// Perchito's Server — control panel.
// A small web GUI (no dependencies beyond `pg` from the repo) for the Ubuntu
// box: service status + start/stop/restart, logs, host health, the outreach
// database (stats, backups/restore, Neon import), projects (a database +
// storage bucket per repo), a file store, settings and "update from GitHub".
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
import { dbIdent, loadProjects, newKey, newPassword, saveProjects, SLUG_RE } from "../lib/projects.mjs";

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
const PROJECTS_DIR = join(STORAGE, "projects");
const TRASH = join(STORAGE, "trash");
const APP_PORT = Number(process.env.PORT || 4517);
const STORAGE_API_PORT = Number(process.env.STORAGE_API_PORT || 9100);

// Units the panel may control. `optional` ones are shown only if installed.
const UNITS = [
  { unit: "fc-crm", label: "fc-crm", desc: "CRM + pipeline + campaigns (:4600), public at :443 via Funnel" },
  { unit: "fc-crm-discover.timer", label: "fc-crm lead discovery", desc: "Daily AI lead search + drafting at 07:00" },
  { unit: "printworks-refund-tracker", label: "Refund Tracker", desc: "Next.js app (:4700), moved off Vercel — public via gateway at /" },
  { unit: "wedding-gallery", label: "Wedding Gallery", desc: "Next.js app (:4800), moved off Vercel — public via gateway at /wedding-gallery" },
  { unit: "perchito-gateway", label: "Shared gateway", desc: "Path-based router (:4900) — Funnel only allows 3 public ports, so every project past the first three shares one" },
  { unit: "fc-outreach-app", label: "Outreach app (retired)", desc: "Superseded by fc-crm — stopped, kept for its data/backups", optional: true },
  { unit: "fc-outreach-worker", label: "AI worker (retired)", desc: "Superseded by fc-crm — stopped, kept for its data/backups", optional: true },
  { unit: "postgresql", label: "PostgreSQL", desc: "Databases for outreach + fc-crm + projects" },
  { unit: "perchito-storage", label: "Storage API", desc: `File storage for projects (:${process.env.STORAGE_API_PORT || 9100})` },
  { unit: "docker", label: "Docker", desc: "Runs the self-hosted Supabase stack (wedding-gallery) — see the Supabase card below" },
  { unit: "fc-outreach-backup.timer", label: "Nightly backup", desc: "pg_dump of every database at 03:00" },
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

async function readEnv() {
  const env = {};
  for (const line of await parseEnvFile()) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/);
    if (m) env[m[1]] = envValue(m[2]);
  }
  return env;
}

async function pgConnect(url) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

async function dbClient() {
  return pgConnect((await readEnv()).DATABASE_URL || process.env.DATABASE_URL);
}

async function adminClient() {
  const url = (await readEnv()).PG_ADMIN_URL;
  if (!url) throw Object.assign(new Error("PG_ADMIN_URL is not set — re-run homeserver/install.sh"), { status: 500 });
  return pgConnect(url);
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

// Every web app on the box, checked by simple reachability (any HTTP
// response, even 401/403 from an app behind Basic auth, counts as "up" —
// only a network-level failure means "down"). Replaces the old single
// fc-outreach-specific /healthz check now that there are several apps.
const APPS = [
  { name: "fc-crm", port: 4600, publicUrl: "https://perchito.tail401924.ts.net" },
  { name: "Refund Tracker", port: 4700, publicUrl: "https://perchito.tail401924.ts.net:10000/" },
  { name: "Wedding Gallery", port: 4800, publicUrl: "https://perchito.tail401924.ts.net:10000/wedding-gallery" },
];

async function appStatus(a) {
  try {
    const r = await fetch(`http://127.0.0.1:${a.port}/`, { signal: AbortSignal.timeout(3000), redirect: "manual" });
    return { ...a, ok: true, status: r.status };
  } catch {
    return { ...a, ok: false, status: null };
  }
}

// The self-hosted Supabase stack (wedding-gallery's DB/auth/storage/realtime)
// runs under Docker Compose, not systemd — UNITS/unitStatus() can't see it.
const SUPABASE_COMPOSE = "/home/perchito/supabase-selfhost/docker/docker-compose.yml";
async function supabaseStatus() {
  const r = await sh("docker", ["compose", "-f", SUPABASE_COMPOSE, "ps", "--format", "json"]);
  if (!r.ok) return { ok: false, containers: [] };
  const containers = r.out
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        const c = JSON.parse(l);
        return { name: c.Service, state: c.State, health: c.Health || null };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return { ok: true, containers };
}

async function overview() {
  const [services, df, apps, supabase, ts, osr] = await Promise.all([
    Promise.all(UNITS.map(unitStatus)),
    sh("df", ["-B1", "--output=target,size,used,avail", "/", STORAGE]),
    Promise.all(APPS.map(appStatus)),
    supabaseStatus(),
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
    apps,
    supabase,
    projects: Object.keys((await loadProjects()).projects).length,
    opsUrl: process.env.OPS_PUBLIC_URL || null,
  };
}

async function dbInfo() {
  const c = await dbClient();
  try {
    // one client runs one query at a time (pg deprecates overlapping queries)
    const { rows: v } = await c.query("select current_setting('server_version') as version, current_database() as db");
    const { rows: size } = await c.query("select pg_database_size(current_database())::bigint as bytes");
    const { rows: tables } = await c.query(`select relname as name, pg_total_relation_size(relid)::bigint as bytes
               from pg_stat_user_tables order by relname`);
    const { rows: conns } = await c.query("select count(*)::int as n from pg_stat_activity where datname = current_database()");
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
    const project = (name.match(/^project-(.+)-\d{8}-\d{6}(?:-final)?\.sql\.gz$/) || [])[1] || null;
    out.push({ name, bytes: s.size, at: s.mtime, project });
  }
  return out.sort((a, b) => b.at - a.at);
}

// Storage locations the file browser can open: shared files, or a project's bucket.
async function rootDir(root) {
  if (!root || root === "files") return FILES;
  const slug = String(root).replace(/^project:/, "");
  const p = (await loadProjects()).projects[slug];
  if (!p || !p.storage) throw Object.assign(new Error("unknown storage location"), { status: 400 });
  return join(PROJECTS_DIR, slug);
}

async function listFiles(root, rel) {
  const base = await rootDir(root);
  await mkdir(base, { recursive: true });
  const dir = inside(base, rel);
  const entries = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const s = await stat(join(dir, d.name)).catch(() => null);
    if (!s || d.name.endsWith(".part")) continue;
    entries.push({ name: d.name, dir: d.isDirectory(), bytes: s.size, at: s.mtime });
  }
  entries.sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name));
  const total = await sh("du", ["-sb", STORAGE]);
  const { projects } = await loadProjects();
  const locations = [{ id: "files", label: "Shared files" }].concat(
    Object.entries(projects)
      .filter(([, p]) => p.storage)
      .map(([slug, p]) => ({ id: `project:${slug}`, label: `${p.name} (bucket)` })),
  );
  return { path: dir.slice(base.length) || "/", entries, locations, storageBytes: total.ok ? Number(total.out.split(/\s/)[0]) : null };
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
  const env = await readEnv();
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

// ─────────────────────────────── projects (other repos) ───────────────────────────────
const httpError = (status, message) => Object.assign(new Error(message), { status });
const lanIp = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .find((n) => n && n.family === "IPv4" && !n.internal)?.address || "127.0.0.1";

async function endpoints() {
  const env = await readEnv();
  const dbHost = env.DB_PUBLIC_HOST || (env.DB_NETWORK === "on" ? lanIp() : "127.0.0.1");
  const storageUrl = (env.STORAGE_PUBLIC_URL || `http://${lanIp()}:${STORAGE_API_PORT}`).replace(/\/$/, "");
  return { dbHost, dbNetwork: env.DB_NETWORK === "on", storageUrl };
}

async function dirBytes(dir) {
  const r = await sh("du", ["-sb", dir]);
  return r.ok ? Number(r.out.split(/\s/)[0]) : 0;
}

async function listProjects() {
  const { projects } = await loadProjects();
  const slugs = Object.keys(projects).sort();
  const sizes = {};
  const dbs = slugs.filter((s) => projects[s].db).map((s) => projects[s].db.name);
  if (dbs.length) {
    try {
      const c = await adminClient();
      try {
        const { rows } = await c.query(
          "select datname, pg_database_size(datname)::bigint as bytes from pg_database where datname = any($1)",
          [dbs],
        );
        for (const row of rows) sizes[row.datname] = Number(row.bytes);
      } finally {
        await c.end();
      }
    } catch {
      /* sizes are best effort */
    }
  }
  const list = [];
  for (const slug of slugs) {
    const pr = projects[slug];
    list.push({
      slug,
      name: pr.name,
      createdAt: pr.createdAt,
      publicRead: !!pr.publicRead,
      storage: !!pr.storage,
      db: pr.db ? { name: pr.db.name } : null,
      dbBytes: pr.db ? (sizes[pr.db.name] ?? null) : null,
      storageBytes: pr.storage ? await dirBytes(join(PROJECTS_DIR, slug)) : null,
    });
  }
  return { projects: list, ...(await endpoints()) };
}

async function projectDetail(slug) {
  const pr = (await loadProjects()).projects[slug];
  if (!pr) throw httpError(404, "no such project");
  const ep = await endpoints();
  const dbUrl = pr.db ? `postgresql://${pr.db.user}:${pr.db.password}@${ep.dbHost}:5432/${pr.db.name}` : null;
  const lines = [];
  if (dbUrl) lines.push(`DATABASE_URL=${dbUrl}`);
  if (pr.storage) lines.push(`HOME_STORAGE_URL=${ep.storageUrl}`, `HOME_STORAGE_PROJECT=${slug}`, `HOME_STORAGE_KEY=${pr.key}`);
  return {
    slug,
    name: pr.name,
    createdAt: pr.createdAt,
    publicRead: !!pr.publicRead,
    storage: !!pr.storage,
    key: pr.storage ? pr.key : null,
    db: pr.db ? { name: pr.db.name, user: pr.db.user, url: dbUrl } : null,
    storageEndpoint: pr.storage ? `${ep.storageUrl}/v1/${slug}` : null,
    env: lines.join("\n"),
    ...ep,
  };
}

async function createProject({ name, slug, db = true, storage = true, publicRead = false }) {
  name = String(name || "").trim();
  slug = String(slug || name).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!name) throw httpError(400, "give the project a name");
  if (!SLUG_RE.test(slug)) throw httpError(400, "id must be 3–32 characters: a–z, 0–9 and -, starting with a letter");
  if (!db && !storage) throw httpError(400, "pick a database, storage or both");
  const data = await loadProjects();
  if (data.projects[slug]) throw httpError(409, `a project called “${slug}” already exists`);

  const entry = { name, createdAt: new Date().toISOString(), key: newKey(), publicRead: !!publicRead, storage: !!storage, db: null };
  if (db) {
    const ident = dbIdent(slug); // validated slug → safe identifier
    const password = newPassword(); // hex → safe literal
    const c = await adminClient();
    try {
      const exists = await c.query("select 1 from pg_roles where rolname = $1 union all select 1 from pg_database where datname = $1", [ident]);
      if (exists.rowCount) throw httpError(409, `database or role ${ident} already exists`);
      await c.query(`create role "${ident}" login password '${password}'`);
      await c.query(`grant "${ident}" to current_user`); // lets the admin role own-and-manage it
      await c.query(`grant hs_projects to "${ident}"`); // pg_hba lets this group in over the network
      await c.query(`create database "${ident}" owner "${ident}"`);
      await c.query(`revoke all on database "${ident}" from public`);
    } finally {
      await c.end();
    }
    entry.db = { name: ident, user: ident, password };
  }
  if (storage) await mkdir(join(PROJECTS_DIR, slug), { recursive: true });
  data.projects[slug] = entry;
  await saveProjects(data);
  return projectDetail(slug);
}

async function updateProject(slug, { publicRead, regenerateKey, resetDbPassword }) {
  const data = await loadProjects();
  const pr = data.projects[slug];
  if (!pr) throw httpError(404, "no such project");
  if (typeof publicRead === "boolean") pr.publicRead = publicRead;
  if (regenerateKey) pr.key = newKey();
  if (resetDbPassword && pr.db) {
    const password = newPassword();
    const c = await adminClient();
    try {
      await c.query(`alter role "${pr.db.user}" password '${password}'`);
    } finally {
      await c.end();
    }
    pr.db.password = password;
  }
  await saveProjects(data);
  return projectDetail(slug);
}

async function deleteProject(slug) {
  const data = await loadProjects();
  const pr = data.projects[slug];
  if (!pr) throw httpError(404, "no such project");
  const log = [];
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const ts = `${stamp.slice(0, 8)}-${stamp.slice(8)}`;
  if (pr.db) {
    // final backup first — kept in backups/ after the database is gone
    await mkdir(BACKUPS, { recursive: true });
    const out = join(BACKUPS, `project-${slug}-${ts}-final.sql.gz`);
    const dump = await sh("bash", ["-c", 'set -o pipefail; pg_dump --no-owner --no-acl --clean --if-exists "$SRC" | gzip -9 > "$OUT" || { rm -f "$OUT"; exit 1; }'], {
      env: { ...process.env, SRC: `postgresql://${pr.db.user}:${pr.db.password}@127.0.0.1:5432/${pr.db.name}`, OUT: out },
      timeout: 900_000,
    });
    if (!dump.ok) throw httpError(500, `final backup failed, nothing deleted: ${dump.out}`);
    log.push(`final database backup: ${basename(out)}`);
    const c = await adminClient();
    try {
      await c.query(`drop database if exists "${pr.db.name}" with (force)`);
      await c.query(`drop role if exists "${pr.db.user}"`);
    } finally {
      await c.end();
    }
    log.push(`dropped database ${pr.db.name}`);
  }
  if (pr.storage) {
    const bucket = join(PROJECTS_DIR, slug);
    await mkdir(TRASH, { recursive: true });
    const dest = join(TRASH, `${slug}-${ts}`);
    await rename(bucket, dest).catch(() => {});
    log.push(`files moved to ${dest} (delete that folder to free the space)`);
  }
  delete data.projects[slug];
  await saveProjects(data);
  return { ok: true, out: log.join("\n") };
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

  const froot = () => rootDir(url.searchParams.get("root"));
  if (p === "/files" && m === "GET") {
    return send(res, 200, await listFiles(url.searchParams.get("root"), url.searchParams.get("path") || ""));
  }
  if (p === "/files/download" && m === "GET") return download(res, inside(await froot(), url.searchParams.get("path")));
  if (p === "/files/upload" && m === "POST") {
    const dir = inside(await froot(), url.searchParams.get("path") || "");
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
    await mkdir(inside(inside(await froot(), rel || ""), name), { recursive: true });
    return send(res, 200, { ok: true });
  }
  if (p === "/files" && m === "DELETE") {
    const base = await froot();
    const target = inside(base, url.searchParams.get("path"));
    if (target === base) return send(res, 400, { error: "can't delete the storage root" });
    await rm(target, { recursive: true });
    return send(res, 200, { ok: true });
  }

  if (p === "/projects" && m === "GET") return send(res, 200, await listProjects());
  if (p === "/projects" && m === "POST") return send(res, 200, await createProject(await readJson(req)));
  if ((r = p.match(/^\/projects\/([a-z0-9-]+)$/))) {
    if (m === "GET") return send(res, 200, await projectDetail(r[1]));
    if (m === "PATCH") return send(res, 200, await updateProject(r[1], await readJson(req)));
    if (m === "DELETE") {
      if (url.searchParams.get("confirm") !== r[1]) return send(res, 400, { error: "type the project name to confirm" });
      return send(res, 200, await deleteProject(r[1]));
    }
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

server.listen(PORT, HOST, () => console.log(`Perchito's Server panel on http://${HOST}:${PORT}`));
