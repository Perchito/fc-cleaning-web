const API = "/api/outreach";
const $ = (s, r = document) => r.querySelector(s);
const el = (t, props = {}, kids = []) => {
  const n = Object.assign(document.createElement(t), props);
  for (const k of [].concat(kids)) if (k != null) n.append(k);
  return n;
};

const STATUS_LABEL = {
  replied: "Replied",
  follow_up_due: "Follow-up due",
  awaiting_reply: "Awaiting reply",
  draft: "Draft",
  bounced: "Bounced",
  won: "Won",
  lost: "Lost",
  unsubscribed: "Unsubscribed",
};

let STATE = { prospects: [], counts: {} };

function toast(msg, ms = 3200) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), ms);
}

async function api(path, opts) {
  const r = await fetch(API + path, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

async function refresh() {
  STATE = await api("/prospects");
  render();
}

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function timeAgo(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 90) return "just now";
  const m = s / 60;
  if (m < 90) return Math.round(m) + " min ago";
  const h = m / 60;
  if (h < 36) return Math.round(h) + "h ago";
  return Math.round(h / 24) + "d ago";
}

// Workflow sections — grouped by what you need to do, not raw status.
const SECTIONS = [
  { key: "replied", title: "Replied — respond to these", statuses: ["replied"], defaultOpen: true },
  { key: "followup", title: "Follow up now", statuses: ["follow_up_due"], defaultOpen: true },
  { key: "tosend", title: "To send", statuses: ["draft"], defaultOpen: true },
  { key: "awaiting", title: "Awaiting reply", statuses: ["awaiting_reply"], defaultOpen: true },
  { key: "attention", title: "Needs attention", statuses: ["bounced"], defaultOpen: true },
  { key: "closed", title: "Closed", statuses: ["won", "lost", "unsubscribed"], defaultOpen: false },
];

function collapsedSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem("fc_ops_collapsed") || "[]"));
  } catch {
    return new Set();
  }
}
function saveCollapsed(set) {
  try {
    localStorage.setItem("fc_ops_collapsed", JSON.stringify([...set]));
  } catch {
    /* private mode — ignore */
  }
}

function render() {
  const { prospects, counts, total } = STATE;
  $("#sub").textContent = `${total} prospect${total === 1 ? "" : "s"}`;

  const order = ["replied", "follow_up_due", "awaiting_reply", "draft", "bounced"];
  $("#chips").replaceChildren(
    ...order
      .filter((s) => counts[s])
      .map((s) =>
        el("span", { className: "chip" }, [el("b", { textContent: counts[s] }), " " + STATUS_LABEL[s]]),
      ),
  );
  $("#lastpoll").textContent = STATE.lastPollAt ? "last checked " + timeAgo(STATE.lastPollAt) : "not checked yet";

  const list = $("#list");
  if (!prospects.length) {
    list.replaceChildren(el("div", { className: "empty", textContent: "No prospects yet." }));
    return;
  }

  const collapsed = collapsedSet();
  const nodes = [];
  for (const sec of SECTIONS) {
    const items = prospects.filter((p) => sec.statuses.includes(p.effectiveStatus));
    if (!items.length) continue;

    const isCollapsed = collapsed.has(sec.key) || (!collapsed.has("!" + sec.key) && !sec.defaultOpen);
    const body = el("div", { className: "secbody" }, items.map(card));
    body.hidden = isCollapsed;

    const arrow = el("span", { className: "secarrow", textContent: isCollapsed ? "▸" : "▾" });
    const head = el("button", { className: "sechead sec-" + sec.key, type: "button" }, [
      arrow,
      el("span", { className: "sectitle", textContent: sec.title }),
      el("span", { className: "seccount", textContent: items.length }),
    ]);
    head.onclick = () => {
      const c = collapsedSet();
      if (body.hidden) {
        c.delete(sec.key);
        c.add("!" + sec.key); // remember an explicit "open" against a default-closed section
      } else {
        c.add(sec.key);
        c.delete("!" + sec.key);
      }
      saveCollapsed(c);
      body.hidden = !body.hidden;
      arrow.textContent = body.hidden ? "▸" : "▾";
    };

    nodes.push(el("section", { className: "sec" }, [head, body]));
  }
  list.replaceChildren(...nodes);
}

function card(p) {
  const c = el("div", { className: "card", id: "p-" + p.id });

  c.append(
    el("div", { className: "top" }, [
      el("div", {}, [
        el("div", { className: "biz", textContent: p.business }),
        el("div", { className: "email", textContent: p.email }),
      ]),
      el("span", { className: "badge b-" + p.effectiveStatus, textContent: STATUS_LABEL[p.effectiveStatus] || p.effectiveStatus }),
    ]),
  );

  // location / address / phone
  const loc = [p.location, p.address].filter(Boolean).join(" · ");
  if (loc) c.append(el("div", { className: "meta", textContent: "📍 " + loc }));
  if (p.phone)
    c.append(
      el("div", { className: "meta" }, [
        "📞 ",
        el("a", { href: "tel:" + p.phone.replace(/\s+/g, ""), textContent: p.phone, className: "tellink" }),
      ]),
    );

  // history
  const bits = [];
  if (p.lastContactAt) bits.push(`Last contact: ${p.lastContactType} ${timeAgo(p.lastContactAt)}`);
  if (p.callsMade) bits.push(`${p.callsMade} call${p.callsMade === 1 ? "" : "s"} logged`);
  if (p.followUpsSent) bits.push(`${p.followUpsSent} email follow-up${p.followUpsSent === 1 ? "" : "s"}`);
  if (bits.length) c.append(el("div", { className: "meta", textContent: bits.join(" · ") }));

  // next action guidance
  if (p.effectiveStatus === "awaiting_reply" && p.nextActionChannel) {
    c.append(
      el("div", { className: "meta", textContent: `Next: follow up by ${p.nextActionChannel} around ${fmtDate(p.nextActionAt)}` }),
    );
  } else if (p.effectiveStatus === "follow_up_due" && p.nextActionChannel) {
    c.append(
      el("div", { className: "nextnow" }, [`Follow up now — by ${p.nextActionChannel.toUpperCase()}`]),
    );
  }

  if (p.replySnippet && p.effectiveStatus === "replied")
    c.append(el("div", { className: "snippet", textContent: p.replySnippet }));
  if (p.bounceReason && p.effectiveStatus === "bounced")
    c.append(el("div", { className: "snippet", textContent: p.bounceReason }));
  if (p.autoAckAt && p.effectiveStatus !== "replied" && p.effectiveStatus !== "bounced")
    c.append(el("div", { className: "meta", textContent: `✓ Auto-acknowledgement ${timeAgo(p.autoAckAt)} — email landed` }));

  // actions
  const actions = el("div", { className: "actions" });
  const emailBtn = (label, cls) => btn(label, cls, () => openDraft(p));
  const callBtn = (cls) =>
    p.phone
      ? el("a", { className: "btn " + cls, href: "tel:" + p.phone.replace(/\s+/g, ""), textContent: "Call " + p.phone })
      : null;
  const logBtn = () => btn("Log a call", "", () => openCall(p));

  const add = (...nodes) => actions.append(...nodes.filter(Boolean));
  if (p.effectiveStatus === "draft") {
    add(emailBtn("Send first email", "primary"));
  } else if (p.effectiveStatus === "follow_up_due") {
    if (p.nextActionChannel === "phone" && p.phone) {
      add(callBtn("primary"), logBtn(), emailBtn("Email instead", ""));
    } else {
      add(emailBtn("Send follow-up", "primary"), logBtn(), callBtn(""));
    }
  } else if (p.effectiveStatus === "awaiting_reply") {
    add(emailBtn("Send follow-up now", ""), logBtn(), callBtn(""));
  } else if (p.effectiveStatus === "replied") {
    add(emailBtn("Send follow-up", ""), logBtn());
  }

  const sel = el("select");
  sel.append(el("option", { value: "", textContent: "Set status…" }));
  for (const s of ["replied", "won", "lost", "unsubscribed", "awaiting_reply", "bounced"])
    sel.append(el("option", { value: s, textContent: STATUS_LABEL[s] }));
  sel.onchange = async () => {
    if (!sel.value) return;
    try {
      await api("/status", { method: "POST", body: JSON.stringify({ id: p.id, status: sel.value }) });
      toast(`${p.business} → ${STATUS_LABEL[sel.value]}`);
      refresh();
    } catch (e) {
      toast("Failed: " + e.message);
    }
  };
  actions.append(sel);
  c.append(actions);

  const notes = el("textarea", { className: "notes", placeholder: "Notes…", value: p.notes || "" });
  let saveT;
  notes.oninput = () => {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      api("/status", { method: "POST", body: JSON.stringify({ id: p.id, notes: notes.value }) }).catch(() => {});
    }, 800);
  };
  c.append(notes);

  return c;
}

function btn(label, cls, onclick) {
  return el("button", { className: cls, textContent: label, onclick });
}

// --- draft modal ---
let DRAFT_FOR = null;
async function openDraft(p) {
  DRAFT_FOR = p;
  const dlg = $("#draft");
  $("#d-title").textContent = "Loading draft…";
  $("#d-to").value = p.email;
  $("#d-subject").value = "";
  $("#d-text").value = "";
  dlg.showModal();
  try {
    const d = await api("/draft?id=" + encodeURIComponent(p.id));
    $("#d-title").textContent = (d.kind === "initial" ? "First email — " : `Follow-up #${d.round} — `) + p.business;
    $("#d-subject").value = d.subject;
    $("#d-text").value = d.text;
  } catch (e) {
    $("#d-title").textContent = "Couldn't build draft";
    toast(e.message);
  }
}
$("#d-send").onclick = async () => {
  if (!DRAFT_FOR) return;
  const b = $("#d-send");
  b.disabled = true;
  b.textContent = "Sending…";
  try {
    await api("/send", {
      method: "POST",
      body: JSON.stringify({ id: DRAFT_FOR.id, subject: $("#d-subject").value.trim(), text: $("#d-text").value }),
    });
    $("#draft").close();
    toast(`Sent to ${DRAFT_FOR.business}`);
    refresh();
  } catch (e) {
    toast("Send failed: " + e.message);
  } finally {
    b.disabled = false;
    b.textContent = "Send email";
  }
};

// --- log-call modal ---
let CALL_FOR = null;
function openCall(p) {
  CALL_FOR = p;
  $("#c-title").textContent = "Log a call — " + p.business;
  $("#c-note").value = "";
  $("#c-outcome").value = "";
  $("#calllog").showModal();
}
$("#c-save").onclick = async () => {
  if (!CALL_FOR) return;
  const b = $("#c-save");
  b.disabled = true;
  try {
    await api("/call", {
      method: "POST",
      body: JSON.stringify({ id: CALL_FOR.id, note: $("#c-note").value.trim(), outcome: $("#c-outcome").value || null }),
    });
    $("#calllog").close();
    toast(`Call logged for ${CALL_FOR.business}`);
    refresh();
  } catch (e) {
    toast("Failed: " + e.message);
  } finally {
    b.disabled = false;
  }
};

// --- poll ---
$("#poll").onclick = async () => {
  const b = $("#poll");
  b.disabled = true;
  b.textContent = "Checking…";
  try {
    const r = await api("/poll", { method: "POST" });
    const parts = [];
    if (r.replies.length) parts.push(`${r.replies.length} new repl${r.replies.length === 1 ? "y" : "ies"}`);
    if (r.acks?.length) parts.push(`${r.acks.length} auto-ack${r.acks.length === 1 ? "" : "s"}`);
    if (r.bounces.length) parts.push(`${r.bounces.length} bounced`);
    toast(parts.length ? parts.join(", ") : `No changes (scanned ${r.scanned} messages)`);
    refresh();
  } catch (e) {
    toast("Check failed: " + e.message);
  } finally {
    b.disabled = false;
    b.textContent = "Check for replies now";
  }
};

// --- add prospect ---
$("#a-save").onclick = async () => {
  const business = $("#a-biz").value.trim();
  const email = $("#a-email").value.trim();
  if (!business || !email) return toast("Business and email required");
  try {
    await api("/prospects", {
      method: "POST",
      body: JSON.stringify({
        business,
        email,
        contactName: $("#a-contact").value.trim() || undefined,
        phone: $("#a-phone").value.trim() || undefined,
        location: $("#a-location").value.trim() || undefined,
        address: $("#a-address").value.trim() || undefined,
      }),
    });
    for (const id of ["a-biz", "a-email", "a-contact", "a-phone", "a-location", "a-address"]) $("#" + id).value = "";
    toast("Added " + business);
    refresh();
  } catch (e) {
    toast("Failed: " + e.message);
  }
};

refresh().catch((e) => toast("Load failed: " + e.message));
setInterval(() => refresh().catch(() => {}), 120000);
