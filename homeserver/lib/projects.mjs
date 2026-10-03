// Registry of the "projects" hosted on this home server: one entry per repo /
// app that uses it for a database and/or file storage. Shared by the control
// panel (the only writer) and the storage API (reader).
//
// /etc/perchito/projects.json (mode 600, owned by the app user):
//   { "projects": { "<slug>": { name, createdAt, key, publicRead,
//                               storage: true|false,
//                               db: { name, user, password } | null } } }

import crypto from "node:crypto";
import { readFile, rename, stat, writeFile } from "node:fs/promises";

export const PROJECTS_FILE = process.env.PROJECTS_FILE || "/etc/perchito/projects.json";
export const SLUG_RE = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;

let cache = { mtimeMs: -1, data: { projects: {} } };

export async function loadProjects() {
  let s;
  try {
    s = await stat(PROJECTS_FILE);
  } catch {
    return { projects: {} };
  }
  if (s.mtimeMs !== cache.mtimeMs) {
    const data = JSON.parse(await readFile(PROJECTS_FILE, "utf8"));
    cache = { mtimeMs: s.mtimeMs, data: { projects: data.projects || {} } };
  }
  return cache.data;
}

export async function saveProjects(data) {
  const tmp = `${PROJECTS_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  await rename(tmp, PROJECTS_FILE);
  cache.mtimeMs = -1;
}

export const newKey = () => `hs_${crypto.randomBytes(24).toString("base64url")}`;
export const newPassword = () => crypto.randomBytes(18).toString("hex");
export const dbIdent = (slug) => `p_${slug.replace(/-/g, "_")}`;

// Signed URL signature: lets a holder of the URL do one method on one object
// until `exp` (unix seconds), without knowing the project key.
export function signature(key, method, project, path, exp) {
  return crypto.createHmac("sha256", key).update(`${method}\n${project}/${path}\n${exp}`).digest("base64url");
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
