// FC Home Server — control panel front end (vanilla JS, no build).

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
  const opsHost = o.opsUrl || `${location.protocol}//${location.hostname}:${o.app.port}/ops`;
  $("#open-ops").href = opsHost;

  const memUsed = h.memTotal - h.memFree;
  const cpuPct = (h.load[0] / h.cpus) * 100;
  const app = o.app.health;
  let html = stat("App", app?.ok ? "Online" : "Offline", app ? `DB ${app.db ? "connected" : "unreachable"} · up ${duration(app.uptime)}` : "not responding on :" + o.app.port);
  html += stat("CPU load", h.load[0].toFixed(2), `${h.cpus} cores · ${esc(h.cpuModel.replace(/\s+/g, " ").slice(0, 32))}`, cpuPct);
  html += stat("Memory", bytes(memUsed), `of ${bytes(h.memTotal)}`, (memUsed / h.memTotal) * 100);
  for (const d of o.disks) {
    html += stat(d.target === "/" ? "Disk" : `Disk ${d.target}`, bytes(d.used), `${bytes(d.avail)} free of ${bytes(d.size)}`, (d.used / d.size) * 100);
  }
  $("#stats").innerHTML = html;

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
          (b) => `<tr><td title="${esc(b.name)}">${esc(new Date(b.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }))}</td>
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
    if (!confirm(`Restore the database to ${r.dataset.restore}?\n\nCurrent data is backed up first, and the app is stopped while restoring.`)) return;
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

// ─────────────────────────────── storage ───────────────────────────────
let cwd = "";
loaders.storage = async () => {
  const r = await api(`/api/files?path=${encodeURIComponent(cwd)}`);
  $("#storage-line").textContent = `Files kept on the server's disk · storage in use: ${bytes(r.storageBytes)} (includes backups)`;
  const parts = cwd.split("/").filter(Boolean);
  $("#crumbs").innerHTML =
    `<a data-cd="">files</a>` + parts.map((p, i) => ` / <a data-cd="${esc(parts.slice(0, i + 1).join("/"))}">${esc(p)}</a>`).join("");
  $("#files").innerHTML = r.entries.length
    ? `<tr><th>Name</th><th class="num">Size</th><th>Modified</th><th></th></tr>` +
      r.entries
        .map((f) => {
          const path = [cwd, f.name].filter(Boolean).join("/");
          const name = f.dir ? `<a class="dir" data-cd="${esc(path)}">📁 ${esc(f.name)}</a>` : esc(f.name);
          return `<tr><td>${name}</td><td class="num">${f.dir ? "—" : bytes(f.bytes)}</td><td>${esc(ago(f.at))}</td>
            <td class="act">${f.dir ? "" : `<a class="btn small" href="/api/files/download?path=${encodeURIComponent(path)}">Download</a>`}
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
    await busy(rmb, "Delete", () => api(`/api/files?path=${encodeURIComponent(rmb.dataset.rm)}`, { method: "DELETE" }), { modal: false });
    loaders.storage();
  }
});
$("#mkdir").onclick = async () => {
  const name = prompt("Folder name");
  if (!name) return;
  await busy(null, "New folder", () => api("/api/files/mkdir", { method: "POST", body: { path: cwd, name } }), { modal: false });
  loaders.storage();
};
function uploadOne(file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", `/api/files/upload?path=${encodeURIComponent(cwd)}&name=${encodeURIComponent(file.name)}`);
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
