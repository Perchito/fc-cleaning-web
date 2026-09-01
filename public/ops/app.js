const API = "/api/outreach";
const $ = (s, r = document) => r.querySelector(s);
const el = (t, props = {}, kids = []) => {
  const n = Object.assign(document.createElement(t), props);
  for (const k of [].concat(kids)) n.append(k);
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
  const r = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

async function refresh() {
  STATE = await api("/prospects");
  render();
}

function render() {
  const { prospects, counts, total } = STATE;
  $("#sub").textContent = `${total} prospect${total === 1 ? "" : "s"}`;

  const order = ["replied", "follow_up_due", "awaiting_reply", "draft", "bounced"];
  $("#chips").replaceChildren(
    ...order
      .filter((s) => counts[s])
      .map((s) =>
        el("span", { className: "chip" }, [
          el("b", { textContent: counts[s] }),
          document.createTextNode(" " + STATUS_LABEL[s]),
        ]),
      ),
  );

  $("#lastpoll").textContent = STATE.lastPollAt
    ? "last checked " + timeAgo(STATE.lastPollAt)
    : "not checked yet";

  const list = $("#list");
  list.replaceChildren(
    ...(prospects.length ? prospects.map(card) : [el("div", { className: "empty", textContent: "No prospects yet." })]),
  );
}

function card(p) {
  const c = el("div", { className: "card", id: "p-" + p.id });

  c.append(
    el("div", { className: "top" }, [
      el("div", {}, [
        el("div", { className: "biz", textContent: p.business }),
        el("div", { className: "email", textContent: p.email }),
      ]),
      el("span", {
        className: "badge b-" + p.effectiveStatus,
        textContent: STATUS_LABEL[p.effectiveStatus] || p.effectiveStatus,
      }),
    ]),
  );

  const bits = [];
  if (p.lastSendAt)
    bits.push(`${p.lastSendType === "initial" ? "First email" : "Follow-up"} ${timeAgo(p.lastSendAt)}`);
  if (p.effectiveStatus === "awaiting_reply" && p.daysUntilFollowUp != null)
    bits.push(`follow-up suggested in ${Math.max(0, p.daysUntilFollowUp)}d`);
  if (p.followUpsSent) bits.push(`${p.followUpsSent} follow-up${p.followUpsSent === 1 ? "" : "s"} sent`);
  if (p.effectiveStatus === "follow_up_due")
    bits.push(`${p.followUpsRemaining} follow-up${p.followUpsRemaining === 1 ? "" : "s"} left`);
  if (bits.length) c.append(el("div", { className: "meta", textContent: bits.join(" · ") }));

  if (p.replySnippet && p.effectiveStatus === "replied")
    c.append(el("div", { className: "snippet", textContent: p.replySnippet }));
  if (p.bounceReason && p.effectiveStatus === "bounced")
    c.append(el("div", { className: "snippet", textContent: p.bounceReason }));
  if (p.autoAckAt && p.effectiveStatus !== "replied" && p.effectiveStatus !== "bounced")
    c.append(
      el("div", {
        className: "meta",
        textContent: `✓ Auto-acknowledgement received ${timeAgo(p.autoAckAt)} — email definitely landed`,
      }),
    );

  const actions = el("div", { className: "actions" });
  if (p.effectiveStatus === "draft") actions.append(btn("Send first email", "primary", () => openDraft(p)));
  else if (p.effectiveStatus === "follow_up_due") actions.append(btn("Send follow-up", "primary", () => openDraft(p)));
  else if (p.effectiveStatus === "awaiting_reply") actions.append(btn("Send follow-up now", "", () => openDraft(p)));
  else if (p.effectiveStatus === "replied") actions.append(btn("Send follow-up", "", () => openDraft(p)));

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
    $("#d-title").textContent =
      (d.kind === "initial" ? "First email — " : `Follow-up #${d.round} — `) + p.business;
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
      body: JSON.stringify({
        id: DRAFT_FOR.id,
        subject: $("#d-subject").value.trim(),
        text: $("#d-text").value,
      }),
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

$("#a-save").onclick = async () => {
  const business = $("#a-biz").value.trim();
  const email = $("#a-email").value.trim();
  if (!business || !email) return toast("Business and email required");
  try {
    await api("/prospects", {
      method: "POST",
      body: JSON.stringify({ business, email, contactName: $("#a-contact").value.trim() || undefined }),
    });
    $("#a-biz").value = $("#a-email").value = $("#a-contact").value = "";
    toast("Added " + business);
    refresh();
  } catch (e) {
    toast("Failed: " + e.message);
  }
};

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 90) return "just now";
  const m = s / 60;
  if (m < 90) return Math.round(m) + " min ago";
  const h = m / 60;
  if (h < 36) return Math.round(h) + "h ago";
  return Math.round(h / 24) + "d ago";
}

refresh().catch((e) => toast("Load failed: " + e.message));
setInterval(() => refresh().catch(() => {}), 120000);
