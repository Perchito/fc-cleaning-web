import { useCallback, useEffect, useRef, useState } from "react";

const BASE = "/api/outreach";

export async function api(path, opts = {}) {
  const r = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `${r.status} ${r.statusText}`);
  return data;
}

export const get = (p) => api(p);
export const post = (p, body) => api(p, { method: "POST", body: JSON.stringify(body || {}) });
export const patch = (p, body) => api(p, { method: "PATCH", body: JSON.stringify(body || {}) });
export const del = (p, body) => api(p, { method: "DELETE", body: JSON.stringify(body || {}) });

/**
 * Fetch `path` on mount and whenever `key` changes. `reload()` refetches.
 * Poll with `pollMs`.
 */
export function useResource(path, { key = path, pollMs, enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null });
  const alive = useRef(true);

  const load = useCallback(
    async (quiet) => {
      if (!enabled || !path) return;
      if (!quiet) setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await api(path);
        if (alive.current) setState({ data, loading: false, error: null });
      } catch (e) {
        if (alive.current) setState((s) => ({ ...s, loading: false, error: e.message }));
      }
    },
    [path, enabled],
  );

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  useEffect(() => {
    if (!pollMs || !enabled) return;
    const t = setInterval(() => load(true), pollMs);
    return () => clearInterval(t);
  }, [pollMs, enabled, load]);

  return { ...state, reload: () => load(true) };
}

// ─────────────────────────────── toast ───────────────────────────────

let toastListeners = [];
let nextId = 1;
export function toast(message, kind = "info") {
  const t = { id: nextId++, message, kind };
  toastListeners.forEach((l) => l(t));
}
export function useToasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const l = (t) => {
      setItems((xs) => [...xs, t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 4200);
    };
    toastListeners.push(l);
    return () => {
      toastListeners = toastListeners.filter((x) => x !== l);
    };
  }, []);
  return items;
}

// ─────────────────────────────── formatting ───────────────────────────────

/** Poll an ai_jobs row until it's done/failed (or timeout). */
export async function pollJob(jobId, { every = 4000, timeout = 150000 } = {}) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, every));
    try {
      const { job } = await api(`/jobs?id=${jobId}`);
      if (job.status === "done") return { ok: true };
      if (job.status === "failed") return { ok: false, error: job.error || "job failed" };
    } catch {
      /* keep polling */
    }
  }
  return { ok: false, error: "timed out — the worker may be offline" };
}

export const pct = (x) => `${Math.round((x || 0) * 100)}%`;

export function timeAgo(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return "just now";
  const m = s / 60;
  if (m < 60) return `${Math.round(m)}m ago`;
  const h = m / 60;
  if (h < 36) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
