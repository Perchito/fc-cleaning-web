#!/usr/bin/env node
// Home Server storage API: file storage for every project (repo) on this box,
// a self-hosted stand-in for S3 / Vercel Blob / Supabase Storage.
//
//   PUT    /v1/<project>/<path>     upload (body = file bytes)
//   GET    /v1/<project>/<path>     download (Range supported)
//   HEAD   /v1/<project>/<path>     metadata
//   DELETE /v1/<project>/<path>     delete
//   GET    /v1/<project>?prefix=x/  list objects (recursive, max 1000)
//
// Auth, any one of:
//   Authorization: Bearer <project key>          (server-side code)
//   ?exp=<unix secs>&sig=<hmac>                  (signed URL, one method, see lib/projects.mjs)
//   nothing, for GET/HEAD on a project with public read on
// Buckets live in $STORAGE_DIR/projects/<project>/.

import http from "node:http";
import crypto from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { loadProjects, safeEqual, signature } from "../lib/projects.mjs";

const PORT = Number(process.env.STORAGE_API_PORT || 9100);
const HOST = process.env.STORAGE_API_HOST || "0.0.0.0";
const ROOT = join(resolve(process.env.STORAGE_DIR || "/srv/fc-outreach/storage"), "projects");
const MAX_UPLOAD = Number(process.env.STORAGE_MAX_UPLOAD_MB || 5120) * 1024 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json",
  ".txt": "text/plain; charset=utf-8", ".csv": "text/csv; charset=utf-8", ".md": "text/markdown; charset=utf-8",
  ".xml": "application/xml", ".pdf": "application/pdf", ".zip": "application/zip", ".gz": "application/gzip",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".avif": "image/avif", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".heic": "image/heic",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mp3": "audio/mpeg", ".m4a": "audio/mp4",
  ".wav": "audio/wav", ".ogg": "audio/ogg", ".woff2": "font/woff2", ".woff": "font/woff",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function fail(res, code, error) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ error }));
}

// Object path → absolute file path inside the bucket, or null if it escapes / is odd.
function objectPath(bucket, path) {
  if (!path || path.includes("\0") || path.endsWith("/")) return null;
  const parts = path.split("/");
  if (parts.some((p) => p === "" || p === "." || p === ".." || p.endsWith(".part"))) return null;
  const file = resolve(bucket, ...parts);
  return file.startsWith(bucket + sep) ? file : null;
}

function authorised(req, url, project, slug, path, key) {
  const method = req.method === "HEAD" ? "GET" : req.method;
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ") && safeEqual(auth.slice(7), key)) return true;
  const exp = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");
  if (exp && sig && Number(exp) > Date.now() / 1000) {
    if (safeEqual(sig, signature(key, method, slug, path, exp))) return true;
  }
  return method === "GET" && project.publicRead && path !== "";
}

async function walk(dir, base, out, limit) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (out.length >= limit) return;
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full, base, out, limit);
    else if (e.isFile() && !e.name.endsWith(".part")) {
      const s = await stat(full);
      out.push({ path: relative(base, full).split(sep).join("/"), bytes: s.size, updatedAt: s.mtime });
    }
  }
}

async function handleList(res, url, bucket) {
  const prefix = url.searchParams.get("prefix") || "";
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit")) || 1000));
  if (prefix.includes("..")) return fail(res, 400, "bad prefix");
  // walk the deepest directory the prefix names, then filter by the full prefix
  const dirPart = prefix.includes("/") ? prefix.slice(0, prefix.lastIndexOf("/")) : "";
  const start = resolve(bucket, dirPart);
  if (start !== bucket && !start.startsWith(bucket + sep)) return fail(res, 400, "bad prefix");
  const all = [];
  await walk(start, bucket, all, 100_000);
  const objects = all.filter((o) => o.path.startsWith(prefix)).slice(0, limit);
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ objects, truncated: objects.length === limit }));
}

async function handleGet(req, res, file, publicRead) {
  let s;
  try {
    s = await stat(file);
    if (!s.isFile()) throw new Error();
  } catch {
    return fail(res, 404, "not found");
  }
  const etag = `"${s.size.toString(16)}-${Math.floor(s.mtimeMs).toString(16)}"`;
  const headers = {
    "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
    "Accept-Ranges": "bytes",
    ETag: etag,
    "Last-Modified": s.mtime.toUTCString(),
    "Cache-Control": publicRead ? "public, max-age=3600" : "private, max-age=0",
  };
  // stored files are data, not pages: stop uploaded HTML/SVG running scripts on this origin
  if (/\.(html?|svg|xml|xhtml)$/i.test(file)) headers["Content-Security-Policy"] = "sandbox";
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  let start = 0;
  let end = s.size - 1;
  let code = 200;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (range && s.size > 0) {
    if (range[1] === "") start = Math.max(0, s.size - Number(range[2]));
    else {
      start = Number(range[1]);
      if (range[2] !== "") end = Math.min(end, Number(range[2]));
    }
    if (start > end || start >= s.size) {
      res.writeHead(416, { "Content-Range": `bytes */${s.size}` });
      return res.end();
    }
    code = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${s.size}`;
  }
  headers["Content-Length"] = s.size === 0 ? 0 : end - start + 1;
  res.writeHead(code, headers);
  if (req.method === "HEAD" || s.size === 0) return res.end();
  createReadStream(file, { start, end }).pipe(res);
}

async function handlePut(req, res, file) {
  const declared = Number(req.headers["content-length"] || 0);
  if (declared > MAX_UPLOAD) return fail(res, 413, "file too large");
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${crypto.randomBytes(4).toString("hex")}.part`;
  let size = 0;
  const limiter = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      cb(size > MAX_UPLOAD ? Object.assign(new Error("file too large"), { status: 413 }) : null, chunk);
    },
  });
  try {
    await pipeline(req, limiter, createWriteStream(tmp));
    await rename(tmp, file);
  } catch (e) {
    await rm(tmp, { force: true });
    return fail(res, e.status || 500, e.message);
  }
  res.writeHead(201, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: true, bytes: size }));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, ETag");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Max-Age": "86400" });
    return res.end();
  }
  if (url.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end('{"ok":true}');
  }

  const m = /^\/v1\/([a-z0-9-]+)(?:\/(.*))?$/.exec(url.pathname);
  if (!m) return fail(res, 404, "not found");
  let slug, path;
  try {
    slug = m[1];
    path = decodeURIComponent(m[2] || "");
  } catch {
    return fail(res, 400, "bad path");
  }

  try {
    const project = (await loadProjects()).projects[slug];
    if (!project || !project.storage) return fail(res, 404, "no such project");
    if (!authorised(req, url, project, slug, path, project.key)) return fail(res, 401, "unauthorized");
    const bucket = join(ROOT, slug);

    if (path === "" && req.method === "GET") return await handleList(res, url, bucket);
    const file = objectPath(bucket, path);
    if (!file) return fail(res, 400, "bad object path");

    if (req.method === "GET" || req.method === "HEAD") return await handleGet(req, res, file, project.publicRead);
    if (req.method === "PUT") return await handlePut(req, res, file);
    if (req.method === "DELETE") {
      await rm(file, { force: true });
      res.writeHead(204);
      return res.end();
    }
    return fail(res, 405, "method not allowed");
  } catch (e) {
    console.error(req.method, url.pathname, e);
    if (!res.headersSent) fail(res, 500, "internal error");
    else res.end();
  }
});

server.listen(PORT, HOST, () => console.log(`Home Server storage API on http://${HOST}:${PORT}/v1/<project>/…  (buckets in ${ROOT})`));
