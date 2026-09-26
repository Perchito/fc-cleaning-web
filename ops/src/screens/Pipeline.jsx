import { useCallback, useMemo, useState } from "react";
import { useResource, post, toast, timeAgo } from "../api.js";
import { PageHead } from "../App.jsx";
import { Badge, Loading, ErrorBox, Empty, Button } from "../ui.jsx";

// Pipeline columns → prospect status mapping. follow_up_due is a derived
// effectiveStatus, so those cards stay in Contacted but get an amber flag.
const COLUMNS = [
  { key: "draft",          label: "New Lead",   match: (p) => p.status === "draft" },
  { key: "awaiting_reply", label: "Contacted",  match: (p) => p.status === "awaiting_reply" },
  { key: "replied",        label: "Replied",    match: (p) => p.status === "replied" },
  { key: "quote_sent",     label: "Quote Sent", match: (p) => p.status === "quote_sent" },
  { key: "won",            label: "Won",        match: (p) => p.status === "won" },
  { key: "lost",           label: "Lost",       match: (p) => p.status === "lost" },
];

const STAGE_BADGE = {
  draft: "gray",
  awaiting_reply: "blue",
  replied: "green",
  quote_sent: "purple",
  won: "teal",
  lost: "gray",
};

function FsaBadge({ rating }) {
  if (!rating) return null;
  if (rating === "AwaitingInspection")
    return <Badge tone="blue" className="!px-1.5">New · awaiting inspection</Badge>;
  const n = Number(rating);
  const tone = n <= 1 ? "rose" : n === 2 ? "amber" : "emerald";
  return <Badge tone={tone} className="!px-1.5">FSA ★ {rating}</Badge>;
}

function CardItem({ p, colKey, onDragStart, onOpen }) {
  const due = p.effectiveStatus === "follow_up_due";
  const dead = p.status === "bounced" || p.status === "unsubscribed";
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, p.id)}
      onClick={() => onOpen(p)}
      className="cursor-grab rounded-xl border border-navy-200/70 bg-white p-3 shadow-sm transition hover:border-navy-300 hover:shadow active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-navy-900">{p.business}</div>
          {p.contactName && (
            <div className="truncate text-xs text-navy-500">{p.contactName}</div>
          )}
        </div>
        {colKey === "won" && <span className="text-emerald-500">✓</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <FsaBadge rating={p.fsaRating} />
        {due && <Badge tone="amber" className="!px-1.5">follow-up due</Badge>}
        {dead && <Badge tone="rose" className="!px-1.5">{p.status}</Badge>}
        {p.hook && !due && (
          <span className="truncate text-[11px] italic text-navy-400">{p.hook}</span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-navy-400">
        <span>{p.location || ""}</span>
        <span title="Last contact">
          {p.lastContactAt ? timeAgo(p.lastContactAt) : p.daysSinceLastContact == null ? "new" : ""}
        </span>
      </div>
    </div>
  );
}

export default function Pipeline() {
  const { data, loading, error, reload } = useResource("/prospects", { pollMs: 60000 });
  const [overCol, setOverCol] = useState(null);
  const [busy, setBusy] = useState(false);

  const prospects = useMemo(
    () => (data?.prospects || []).filter((p) => p.status !== "bounced" && p.status !== "unsubscribed" || true),
    [data],
  );

  const byCol = useMemo(() => {
    const m = Object.fromEntries(COLUMNS.map((c) => [c.key, []]));
    for (const p of prospects) {
      const col = COLUMNS.find((c) => c.match(p));
      if (col) m[col.key].push(p);
    }
    // newest activity first inside a column
    for (const k of Object.keys(m))
      m[k].sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
    return m;
  }, [prospects]);

  const onDragStart = useCallback((e, id) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  async function onDrop(e, colKey) {
    e.preventDefault();
    setOverCol(null);
    const id = e.dataTransfer.getData("text/plain");
    const p = prospects.find((x) => x.id === id);
    if (!p || p.status === colKey) return;
    setBusy(true);
    try {
      await post("/status", { id, status: colKey });
      toast(`${p.business} → ${COLUMNS.find((c) => c.key === colKey).label}`, "success");
      reload();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function onOpen(p) {
    // Keep it simple: jump to Prospects screen filtered to this business.
    window.location.hash = `#/prospects?q=${encodeURIComponent(p.business)}`;
    window.dispatchEvent(new CustomEvent("ops:open-prospect", { detail: p.id }));
  }

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const total = prospects.length;

  return (
    <>
      <PageHead title="Pipeline" sub={`${total} live prospects · drag cards between stages`}>
        <Button size="sm" variant="outline" onClick={reload} disabled={busy}>
          Refresh
        </Button>
      </PageHead>

      <div className="flex gap-3 overflow-x-auto p-5" style={{ minHeight: "60vh" }}>
        {COLUMNS.map((col) => {
          const items = byCol[col.key];
          const won = col.key === "won";
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setOverCol(col.key);
              }}
              onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
              onDrop={(e) => onDrop(e, col.key)}
              className={`flex w-64 shrink-0 flex-col rounded-2xl border p-2 transition ${
                overCol === col.key
                  ? "border-teal-400 bg-teal-50/60"
                  : won
                    ? "border-emerald-200 bg-emerald-50/40"
                    : "border-navy-100 bg-navy-50/60"
              }`}
            >
              <div className="flex items-center justify-between px-2 pb-2 pt-1">
                <span className={`text-xs font-extrabold uppercase tracking-wide ${won ? "text-emerald-700" : "text-navy-600"}`}>
                  {col.label}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${won ? "bg-emerald-600 text-white" : "bg-navy-200 text-navy-700"}`}>
                  {items.length}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
                {items.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-navy-200 py-6 text-center text-[11px] text-navy-400">
                    drop here
                  </div>
                ) : (
                  items.map((p) => (
                    <CardItem key={p.id} p={p} colKey={col.key} onDragStart={onDragStart} onOpen={onOpen} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
