// Perchito's Server — control panel front end (vanilla JS, no build).

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ─────────────────────────────── api ───────────────────────────────
async function api(path, { method = "GET", body, raw } = {}) {
  const r = await fetch(path, {
    method,
    headers: { "x-fc-panel": "1", ...(body && !raw ? { "content-type": "application/json" } : {}) },
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401 && !path.startsWith("/login")) {
    showLogin();
    throw new Error("login required");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || data.out || `${r.status}`), { data });
  return data;
}

// ─────────────────────────────── formatting ───────────────────────────────
function bytes(n) {
  if (n == null || !Number.isFinite(+n)) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  n = +n;
  while (n >= 1024 && i < u.length - 1) (n /= 1024), i++;
  return `${n.toFixed(n < 10 && i ? 1 : 0)} ${u[i]}`;
}
function duration(s) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
function ago(date) {
  const s = (Date.now() - new Date(date)) / 1000;
  if (!Number.isFinite(s)) return "—";
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(date).toLocaleString();
}
function pill(state) {
  const cls = state === "active" ? "ok" : state === "failed" ? "bad" : state === "activating" || state === "reloading" ? "warn" : "";
  return `<span class="pill ${cls}">${esc(state || "unknown")}</span>`;
}

// ─────────────────────────────── ui helpers ───────────────────────────────
let toastTimer;
function toast(msg, bad = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `toast${bad ? " bad" : ""}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 4000);
}
function showOutput(title, text) {
  $("#modal-title").textContent = title;
  $("#modal-body").textContent = text || "(no output)";
  $("#modal").showModal();
}
$("#modal-close").onclick = () => $("#modal").close();

// Run an action with the button disabled; show output in a modal when there is any.
async function busy(btn, label, fn, { modal = true } = {}) {
  const old = btn?.innerHTML;
  if (btn) (btn.disabled = true), (btn.innerHTML = `${esc(label)}…`);
  try {
    const r = await fn();
    if (modal && r?.out) showOutput(label, r.out);
    else toast(`${label}: done`);
    return r;
  } catch (e) {
    if (e.data?.out) showOutput(`${label} — failed`, e.data.out);
    else toast(`${label}: ${e.message}`, true);
  } finally {
    if (btn) (btn.disabled = false), (btn.innerHTML = old);
  }
}

// ─────────────────────────────── auth ───────────────────────────────
function showLogin() {
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#login-form input").focus();
}
$("#login-form").onsubmit = async (e) => {
  e.preventDefault();
  $("#login-error").textContent = "";
  try {
    await api("/login", { method: "POST", body: { password: e.target.password.value } });
    e.target.reset();
    start();
  } catch (err) {
    $("#login-error").textContent = err.message;
  }
};
$("#logout").onclick = async () => {
  await fetch("/logout");
  showLogin();
};

// ─────────────────────────────── routing ───────────────────────────────
const loaders = {};
let current = null;
function route() {
  const tab = (location.hash || "#overview").slice(1);
  const name = loaders[tab] ? tab : "overview";
  current = name;
  $$("[data-panel]").forEach((s) => (s.hidden = s.dataset.panel !== name));
  $$("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.tab === name));
  loaders[name]().catch((e) => e.message !== "login required" && toast(e.message, true));
}
addEventListener("hashchange", route);

// ─────────────────────────────── overview ───────────────────────────────
let lastOverview = null;
function stat(label, value, sub = "", pct = null) {
  const cls = pct == null ? "" : pct > 90 ? "bad" : pct > 75 ? "warn" : "";
  return `<div class="stat"><div class="label">${esc(label)}</div><div class="value">${value}</div>
    ${sub ? `<div class="sub">${sub}</div>` : ""}
    ${pct == null ? "" : `<div class="bar ${cls}"><div style="width:${Math.min(100, pct).toFixed(0)}%"></div></div>`}</div>`;
}
function svcButtons(s) {
  const running = s.active === "active";
  return `<div class="btns">
    ${running ? `<button class="btn small" data-svc="${esc(s.unit)}" data-act="restart">Restart</button>
                 <button class="btn small danger" data-svc="${esc(s.unit)}" data-act="stop">Stop</button>`
              : `<button class="btn small primary" data-svc="${esc(s.unit)}" data-act="start">Start</button>`}
    <a class="btn small ghost" href="#services" data-logs="${esc(s.unit)}">Logs</a></div>`;
}

loaders.overview = async () => {
  const o = await api("/api/overview");
  lastOverview = o;
  const h = o.host;
  $("#hostname").textContent = h.hostname;
  $("#hostline").textContent = `${h.os} · up ${duration(h.uptime)} · ${[...h.ips, h.tailscale && `tailscale ${h.tailscale}`].filter(Boolean).join(" · ")}`;
  $("#open-ops").href = "https://crm.perchito.app";

  const memUsed = h.memTotal - h.memFree;
  const cpuPct = (h.load[0] / h.cpus) * 100;
  const appsUp = o.apps.filter((a) => a.ok).length;
  let html = stat("Apps", `${appsUp}/${o.apps.length}`, "online — see below");
  html += stat("CPU load", h.load[0].toFixed(2), `${h.cpus} cores · ${esc(h.cpuModel.replace(/\s+/g, " ").slice(0, 32))}`, cpuPct);
  html += stat("Memory", bytes(memUsed), `of ${bytes(h.memTotal)}`, (memUsed / h.memTotal) * 100);
  for (const d of o.disks) {
    html += stat(d.target === "/" ? "Disk" : `Disk ${d.target}`, bytes(d.used), `${bytes(d.avail)} free of ${bytes(d.size)}`, (d.used / d.size) * 100);
  }
  html += stat("Projects", o.projects ?? 0, `<a href="#projects">databases &amp; storage for other repos</a>`);
  $("#stats").innerHTML = html;

  $("#app-cards").innerHTML = o.apps
    .map(
      (a) => `<div class="card svc"><div class="svc-top"><span class="svc-name">${esc(a.name)}</span>${pill(a.ok ? "active" : "failed")}</div>
        <div class="desc">${a.ok ? `responding on :${a.port}` : `not responding on :${a.port}`}</div>
        <div class="btns"><a class="btn small ghost" href="${esc(a.publicUrl)}" target="_blank" rel="noopener">Open ↗</a>${
          // localPath = app listens on all interfaces, so it opens directly over Tailscale/LAN (no Cloudflare, no DNS)
          a.localPath ? `<a class="btn small ghost" href="http://${esc(location.hostname)}:${a.port}${esc(a.localPath)}" target="_blank" rel="noopener">Local ↗</a>` : ""
        }</div></div>`,
    )
    .join("");

  const sb = o.supabase;
  $("#supabase-cards").innerHTML = sb.ok
    ? sb.containers
        .map(
          (c) => `<div class="card svc"><div class="svc-top"><span class="svc-name">${esc(c.name)}</span>${pill(c.state === "running" ? "active" : c.state)}</div>
        <div class="desc">${esc(c.health || c.state)}</div></div>`,
        )
        .join("")
    : `<div class="card svc"><div class="desc">docker compose not reachable — is Docker running?</div></div>`;

  $("#svc-cards").innerHTML = o.services
    .map(
      (s) => `<div class="card svc"><div class="svc-top"><span class="svc-name">${esc(s.label)}</span>${pill(s.installed ? s.active : "not installed")}</div>
        <div class="desc">${esc(s.desc)}${s.since && s.active === "active" ? ` · since ${esc(ago(s.since))}` : ""}${s.memory ? ` · ${bytes(s.memory)}` : ""}</div>
        ${s.installed ? svcButtons(s) : ""}</div>`,
    )
    .join("");
};

// service buttons (delegated — works in cards and the table)
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-svc]");
  if (b) {
    const { svc, act } = b.dataset;
    if (act === "stop" && !confirm(`Stop ${svc}?`)) return;
    await busy(b, `${act} ${svc}`, () => api(`/api/services/${svc}/${act}`, { method: "POST" }), { modal: false });
    return route();
  }
  const l = e.target.closest("[data-logs]");
  if (l) {
    e.preventDefault();
    location.hash = "#services";
    setTimeout(() => {
      $("#log-unit").value = l.dataset.logs;
      loadLogs();
    });
  }
  const j = e.target.closest("[data-job]");
  if (j) {
    const labels = { poll: "Check inbox", cron: "Daily job", discover: "Find new leads" };
    await busy(j, labels[j.dataset.job], () => api(`/api/jobs/${j.dataset.job}`, { method: "POST" }));
  }
});

$("#update").onclick = async (e) => {
  if (!confirm("Pull the latest code from GitHub, rebuild and restart everything?")) return;
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = "Updating…";
  try {
    const r = await api("/api/update", { method: "POST" });
    showOutput("Update from GitHub", r.out);
  } catch (err) {
    if (err.data?.out) showOutput("Update — failed", err.data.out);
    else toast("Panel is restarting — reloading in a few seconds");
  }
  setTimeout(() => location.reload(), 6000);
};

// ─────────────────────────────── services & logs ───────────────────────────────
let followTimer = null;
loaders.services = async () => {
  const fresh = await api("/api/overview");
  lastOverview = fresh;
  $("#svc-table").innerHTML =
    `<tr><th>Service</th><th>Status</th><th>Boot</th><th class="num">Memory</th><th class="num">Restarts</th><th></th></tr>` +
    fresh.services
      .map(
        (s) => `<tr><td><b>${esc(s.label)}</b><div class="muted small">${esc(s.unit)}</div></td>
          <td>${pill(s.installed ? s.active : "not installed")}</td>
          <td>${esc(s.enabled || "—")}</td>
          <td class="num">${bytes(s.memory)}</td><td class="num">${s.restarts}</td>
          <td class="act">${s.installed ? svcButtons(s).replace(/<\/?div[^>]*>/g, "") : ""}</td></tr>`,
      )
      .join("");
  const sel = $("#log-unit");
  const prev = sel.value;
  sel.innerHTML = fresh.services.filter((s) => s.installed).map((s) => `<option value="${esc(s.unit)}">${esc(s.label)}</option>`).join("");
  if (prev) sel.value = prev;
  await loadLogs();
};
async function loadLogs() {
  const unit = $("#log-unit").value;
  if (!unit) return;
  const r = await api(`/api/logs/${unit}?lines=${$("#log-lines").value}`);
  const log = $("#log");
  const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 30;
  log.textContent = r.out || "(no log lines)";
  if (atBottom || !log.dataset.loaded) log.scrollTop = log.scrollHeight;
  log.dataset.loaded = "1";
}
$("#log-unit").onchange = () => ($("#log").dataset.loaded = "", loadLogs());
$("#log-lines").onchange = loadLogs;
$("#log-refresh").onclick = loadLogs;
$("#log-follow").onchange = (e) => {
  clearInterval(followTimer);
  if (e.target.checked) followTimer = setInterval(() => current === "services" && loadLogs().catch(() => {}), 3000);
};

// ─────────────────────────────── database ───────────────────────────────
loaders.database = async () => {
  const [db, bk] = await Promise.all([api("/api/db"), api("/api/backups")]);
  if (db.error) {
    $("#db-line").textContent = `Can't connect: ${db.error}`;
    $("#db-stats").innerHTML = "";
    $("#db-tables").innerHTML = `<tr><td class="empty">Database unreachable</td></tr>`;
  } else {
    $("#db-line").textContent = `PostgreSQL ${db.version} · database “${db.db}”`;
    const rows = db.tables.reduce((a, t) => a + t.rows, 0);
    const jobs = Object.fromEntries((db.aiJobs || []).map((j) => [j.status, j.n]));
    $("#db-stats").innerHTML =
      stat("Size", bytes(db.bytes)) +
      stat("Tables", db.tables.length, `${rows.toLocaleString()} rows total`) +
      stat("Connections", db.connections) +
      stat("AI jobs waiting", (jobs.pending || 0) + (jobs.running || 0), `${jobs.done || 0} done · ${jobs.failed || jobs.error || 0} failed`);
    $("#db-tables").innerHTML =
      `<tr><th>Table</th><th class="num">Rows</th><th class="num">Size</th></tr>` +
      db.tables.map((t) => `<tr><td>${esc(t.name)}</td><td class="num">${t.rows.toLocaleString()}</td><td class="num">${bytes(t.bytes)}</td></tr>`).join("");
  }
  $("#backups").innerHTML = bk.backups.length
    ? `<tr><th>Backup</th><th class="num">Size</th><th></th></tr>` +
      bk.backups
        .map(
          (b) => `<tr><td title="${esc(b.name)}">${esc(new Date(b.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }))}
          <div class="muted small">${b.project ? `project: ${esc(b.project)}${b.name.includes("-final") ? " (final)" : ""}` : "outreach"}</div></td>
          <td class="num">${bytes(b.bytes)}</td>
          <td class="act"><a class="btn small" href="/api/backups/download?name=${encodeURIComponent(b.name)}">Download</a>
          <button class="btn small" data-restore="${esc(b.name)}">Restore</button>
          <button class="btn small danger" data-delbk="${esc(b.name)}">Delete</button></td></tr>`,
        )
        .join("")
    : `<tr><td class="empty">No backups yet — click “Back up now”.</td></tr>`;
};
const backupNow = (e) => busy(e.currentTarget, "Backup", () => api("/api/backups", { method: "POST" })).then(() => current === "database" && route());
$("#backup-now").onclick = backupNow;
$("#backup-now-2").onclick = backupNow;
$("#backups").onclick = async (e) => {
  const r = e.target.closest("[data-restore]");
  if (r) {
    if (!confirm(`Restore from ${r.dataset.restore}?\n\nThe backup goes back into the database it came from. Its current data is backed up first.`)) return;
    await busy(r, "Restore", () => api("/api/backups/restore", { method: "POST", body: { name: r.dataset.restore } }));
    return route();
  }
  const d = e.target.closest("[data-delbk]");
  if (d && confirm(`Delete backup ${d.dataset.delbk}?`)) {
    await busy(d, "Delete backup", () => api(`/api/backups?name=${encodeURIComponent(d.dataset.delbk)}`, { method: "DELETE" }), { modal: false });
    route();
  }
};
$("#neon-form").onsubmit = async (e) => {
  e.preventDefault();
  if (!confirm("Replace the local database with the data from Neon? (Local data is backed up first.)")) return;
  const btn = $("button", e.target);
  await busy(btn, "Import from Neon", () => api("/api/db/import-neon", { method: "POST", body: { url: e.target.url.value } }));
  e.target.reset();
  route();
};

// ─────────────────────────────── projects ───────────────────────────────
loaders.projects = async () => {
  const r = await api("/api/projects");
  $("#projects").innerHTML = r.projects.length
    ? `<tr><th>Project</th><th>Database</th><th>Storage</th><th>Created</th><th></th></tr>` +
      r.projects
        .map(
          (p) => `<tr><td><b>${esc(p.name)}</b><div class="muted small">${esc(p.slug)}</div></td>
          <td>${p.db ? `${esc(p.db.name)}<div class="muted small">${bytes(p.dbBytes)}</div>` : `<span class="muted">—</span>`}</td>
          <td>${p.storage ? `${bytes(p.storageBytes)}<span class="tag ${p.publicRead ? "pub" : ""}">${p.publicRead ? "public" : "private"}</span>` : `<span class="muted">—</span>`}</td>
          <td>${esc(new Date(p.createdAt).toLocaleDateString())}</td>
          <td class="act"><button class="btn small primary" data-proj="${esc(p.slug)}">Connect</button>
            ${p.storage ? `<button class="btn small" data-browse="${esc(p.slug)}">Files</button>` : ""}
            <button class="btn small danger" data-delproj="${esc(p.slug)}">Delete</button></td></tr>`,
        )
        .join("")
    : `<tr><td class="empty">No projects yet. Create one for each repo that should keep its data on this server.</td></tr>`;
  $("#projects-note").innerHTML = r.dbNetwork
    ? `Databases accept connections from your network at <b>${esc(r.dbHost)}:5432</b>. Storage API: <b>${esc(r.storageUrl)}</b>.`
    : `Databases only accept connections from this server (127.0.0.1). Re-run the installer with <code>--db-network</code> so apps on other machines (LAN / Tailscale) can connect. Storage API: <b>${esc(r.storageUrl)}</b>.`;
};

$("#new-project").onclick = () => {
  $("#project-form").hidden = false;
  $("#project-form [name=name]").focus();
};
$("#project-cancel").onclick = () => ($("#project-form").hidden = true);
$("#project-form [name=name]").oninput = (e) => {
  const slug = $("#project-form [name=slug]");
  if (!slug.dataset.touched) slug.value = e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
};
$("#project-form [name=slug]").oninput = (e) => (e.target.dataset.touched = "1");
$("#project-form").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = { name: f.name.value, slug: f.slug.value, db: f.db.checked, storage: f.storage.checked, publicRead: f.publicRead.checked };
  const btn = $("button[type=submit]", f);
  btn.disabled = true;
  try {
    const p = await api("/api/projects", { method: "POST", body });
    f.reset();
    delete f.slug.dataset.touched;
    f.hidden = true;
    await loaders.projects();
    showProject(p, true);
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
  }
};

function showProject(p, fresh = false) {
  const copyBtn = (text, label = "Copy") => `<button class="btn small" data-copy="${esc(text)}">${label}</button>`;
  let html = fresh ? `<p class="muted">Created. Paste these into the other repo's <code>.env</code> / hosting settings.</p>` : "";
  if (p.env) {
    html += `<div class="pm-section"><h4>Environment variables</h4>${copyBtn(p.env, "Copy all")}<pre class="snippet">${esc(p.env)}</pre></div>`;
  }
  if (p.db) {
    html += `<div class="pm-section"><h4>Database</h4><div class="kv">
      <div>Database / user</div><div><code>${esc(p.db.name)}</code></div>
      <div>Connection string</div><div><code>${esc(p.db.url)}</code> ${copyBtn(p.db.url)}</div>
      <div>Reachable from</div><div>${p.dbNetwork ? "your LAN / Tailscale" : "this server only (install with --db-network to open it to your LAN)"}</div>
    </div><button class="btn small" data-pact="resetDbPassword">Reset database password</button></div>`;
  }
  if (p.storage) {
    html += `<div class="pm-section"><h4>Storage</h4><div class="kv">
      <div>Endpoint</div><div><code>${esc(p.storageEndpoint)}</code> ${copyBtn(p.storageEndpoint)}</div>
      <div>Key</div><div><code>${esc(p.key)}</code> ${copyBtn(p.key)}</div>
      <div>Access</div><div>${p.publicRead ? "anyone with a file URL can read it" : "key or signed URL needed to read"}</div>
      <div>Try it</div><div><code>curl -X PUT -H "Authorization: Bearer $KEY" --data-binary @photo.jpg ${esc(p.storageEndpoint)}/photos/photo.jpg</code></div>
    </div>
    <div class="row"><button class="btn small" data-pact="togglePublic">${p.publicRead ? "Make private" : "Make public"}</button>
    <button class="btn small" data-pact="regenerateKey">New key</button></div>
    <p class="muted small note">Client for other repos: copy <code>homeserver/clients/home-storage.mjs</code> (put, get, list, delete, signed URLs).</p></div>`;
  }
  $("#pm-title").textContent = p.name;
  $("#pm-body").innerHTML = html;
  $("#pm-body").dataset.slug = p.slug;
  $("#pm-body").dataset.public = p.publicRead ? "1" : "";
  if (!$("#project-modal").open) $("#project-modal").showModal();
}
$("#pm-close").onclick = () => $("#project-modal").close();
$("#pm-body").onclick = async (e) => {
  const c = e.target.closest("[data-copy]");
  if (c) {
    await navigator.clipboard.writeText(c.dataset.copy).then(
      () => toast("Copied"),
      () => toast("Copy failed — select the text instead", true),
    );
    return;
  }
  const a = e.target.closest("[data-pact]");
  if (!a) return;
  const slug = $("#pm-body").dataset.slug;
  const act = a.dataset.pact;
  const msg = {
    regenerateKey: "Make a new storage key? The old one (and URLs signed with it) stop working immediately.",
    resetDbPassword: "Reset the database password? Apps using the old connection string will lose access until updated.",
    togglePublic: $("#pm-body").dataset.public ? "Make this bucket private?" : "Make every file in this bucket readable by anyone who has its URL?",
  }[act];
  if (!confirm(msg)) return;
  const body = act === "togglePublic" ? { publicRead: !$("#pm-body").dataset.public } : { [act]: true };
  try {
    showProject(await api(`/api/projects/${slug}`, { method: "PATCH", body }));
    toast("Updated");
    loaders.projects();
  } catch (err) {
    toast(err.message, true);
  }
};
$("#projects").onclick = async (e) => {
  const d = e.target.closest("[data-proj]");
  if (d) return showProject(await api(`/api/projects/${d.dataset.proj}`));
  const b = e.target.closest("[data-browse]");
  if (b) {
    loc = `project:${b.dataset.browse}`;
    cwd = "";
    location.hash = "#storage";
    return;
  }
  const x = e.target.closest("[data-delproj]");
  if (x) {
    const slug = x.dataset.delproj;
    const typed = prompt(`Delete project “${slug}”?\n\nIts database is backed up one last time and then dropped; its files move to storage/trash.\n\nType ${slug} to confirm:`);
    if (typed !== slug) return typed != null && toast("Name didn't match — nothing deleted", true);
    await busy(x, "Delete project", () => api(`/api/projects/${slug}?confirm=${encodeURIComponent(slug)}`, { method: "DELETE" }));
    loaders.projects();
  }
};

// ─────────────────────────────── storage ───────────────────────────────
let cwd = "";
let loc = "files";
const fq = (path) => `root=${encodeURIComponent(loc)}&path=${encodeURIComponent(path)}`;
loaders.storage = async () => {
  let r;
  try {
    r = await api(`/api/files?${fq(cwd)}`);
  } catch (e) {
    if (loc === "files") throw e;
    (loc = "files"), (cwd = ""); // project deleted → back to shared files
    return loaders.storage();
  }
  $("#storage-line").textContent = `Files kept on the server's disk · storage in use: ${bytes(r.storageBytes)} (includes backups)`;
  $("#location").innerHTML = r.locations.map((l) => `<option value="${esc(l.id)}">${esc(l.label)}</option>`).join("");
  $("#location").value = loc;
  const parts = cwd.split("/").filter(Boolean);
  $("#crumbs").innerHTML =
    `<a data-cd="">${loc === "files" ? "files" : esc(loc.slice(8))}</a>` + parts.map((p, i) => ` / <a data-cd="${esc(parts.slice(0, i + 1).join("/"))}">${esc(p)}</a>`).join("");
  $("#files").innerHTML = r.entries.length
    ? `<tr><th>Name</th><th class="num">Size</th><th>Modified</th><th></th></tr>` +
      r.entries
        .map((f) => {
          const path = [cwd, f.name].filter(Boolean).join("/");
          const name = f.dir ? `<a class="dir" data-cd="${esc(path)}">📁 ${esc(f.name)}</a>` : esc(f.name);
          return `<tr><td>${name}</td><td class="num">${f.dir ? "—" : bytes(f.bytes)}</td><td>${esc(ago(f.at))}</td>
            <td class="act">${f.dir ? "" : `<a class="btn small" href="/api/files/download?${fq(path)}">Download</a>`}
            <button class="btn small danger" data-rm="${esc(path)}">Delete</button></td></tr>`;
        })
        .join("")
    : `<tr><td class="empty">This folder is empty — upload files or drop them here.</td></tr>`;
};
document.addEventListener("click", async (e) => {
  const cd = e.target.closest("[data-cd]");
  if (cd) {
    cwd = cd.dataset.cd;
    return loaders.storage();
  }
  const rmb = e.target.closest("[data-rm]");
  if (rmb && confirm(`Delete ${rmb.dataset.rm}? This can't be undone.`)) {
    await busy(rmb, "Delete", () => api(`/api/files?${fq(rmb.dataset.rm)}`, { method: "DELETE" }), { modal: false });
    loaders.storage();
  }
});
$("#location").onchange = (e) => {
  loc = e.target.value;
  cwd = "";
  loaders.storage();
};
$("#mkdir").onclick = async () => {
  const name = prompt("Folder name");
  if (!name) return;
  await busy(null, "New folder", () => api(`/api/files/mkdir?${fq("")}`, { method: "POST", body: { path: cwd, name } }), { modal: false });
  loaders.storage();
};
function uploadOne(file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", `/api/files/upload?${fq(cwd)}&name=${encodeURIComponent(file.name)}`);
    x.setRequestHeader("x-fc-panel", "1");
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => (x.status < 300 ? resolve() : reject(new Error(JSON.parse(x.responseText || "{}").error || x.status)));
    x.onerror = () => reject(new Error("network error"));
    x.send(file);
  });
}
async function upload(files) {
  const bar = $("#progress");
  bar.hidden = false;
  try {
    for (const [i, f] of [...files].entries()) {
      await uploadOne(f, (p) => ($("div", bar).style.width = `${((i + p) / files.length) * 100}%`));
    }
    toast(`Uploaded ${files.length} file${files.length > 1 ? "s" : ""}`);
  } catch (e) {
    toast(`Upload failed: ${e.message}`, true);
  } finally {
    bar.hidden = true;
    $("div", bar).style.width = "0";
    loaders.storage();
  }
}
$("#upload").onchange = (e) => e.target.files.length && upload(e.target.files).then(() => (e.target.value = ""));
const drop = $("#drop");
drop.ondragover = (e) => (e.preventDefault(), drop.classList.add("over"));
drop.ondragleave = () => drop.classList.remove("over");
drop.ondrop = (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
};

// ─────────────────────────────── settings ───────────────────────────────
loaders.settings = async () => {
  const s = await api("/api/settings");
  $("#env-file").textContent = `Environment for the app & worker — ${s.file}. Secrets are never shown; leave blank to keep the current value.`;
  $("#settings").innerHTML =
    `<tr><th>Variable</th><th>Value</th></tr>` +
    s.items
      .map(
        (i) => `<tr><td>${esc(i.key)}</td><td><input name="${esc(i.key)}" ${i.secret ? `type="password" placeholder="${i.set ? "•••••••• (set — type to replace)" : "not set"}"` : `value="${esc(i.value)}"`} data-orig="${i.secret ? "" : esc(i.value)}" data-secret="${i.secret}" autocomplete="off" /></td></tr>`,
      )
      .join("");
};
$("#add-key").onclick = () => {
  const k = $("#new-key").value.trim().toUpperCase();
  if (!/^[A-Z0-9_]+$/.test(k)) return toast("Use capitals, digits and _ only", true);
  $("#settings").insertAdjacentHTML("beforeend", `<tr><td>${esc(k)}</td><td><input name="${esc(k)}" data-orig="" data-new="1" /></td></tr>`);
  $("#new-key").value = "";
};
$("#settings-form").onsubmit = async (e) => {
  e.preventDefault();
  const changes = {};
  for (const inp of $$("#settings input")) {
    const secret = inp.dataset.secret === "true";
    if (secret ? inp.value !== "" : inp.value !== inp.dataset.orig || inp.dataset.new) changes[inp.name] = inp.value;
  }
  if (!Object.keys(changes).length) return toast("Nothing changed");
  await busy($("button[type=submit]", e.target), "Save settings", () =>
    api("/api/settings", { method: "POST", body: { changes, restart: $("#restart-after").checked } }),
  );
  loaders.settings();
};

// ─────────────────────────────── boot ───────────────────────────────
async function start() {
  try {
    const v = await api("/api/version");
    $("#version").textContent = v.commit.split(" ")[0] || "";
    $("#version").title = `${v.branch} · ${v.commit}`;
  } catch {
    return; // showLogin() already called on 401
  }
  $("#login").hidden = true;
  $("#app").hidden = false;
  route();
}
setInterval(() => !document.hidden && current === "overview" && !$("#app").hidden && loaders.overview().catch(() => {}), 10_000);
start();
