import { useState } from "react";
import { useResource, post, toast, timeAgo, pollJob } from "../api.js";
import { PageHead } from "../App.jsx";
import { Button, Badge, Card, Loading, ErrorBox, Empty, TextArea } from "../ui.jsx";

const INTENT_TONE = {
  interested: "green",
  meeting: "teal",
  question: "blue",
  not_now: "amber",
  not_interested: "gray",
  referral: "purple",
  unsubscribe: "rose",
  auto_reply: "gray",
  other: "gray",
};

export default function Replies() {
  const [filter, setFilter] = useState("open");
  const { data, loading, error, reload } = useResource(`/replies?filter=${filter}`, {
    key: `replies-${filter}`,
    pollMs: 45000,
  });

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const items = data.items || [];
  return (
    <>
      <PageHead title="Replies" sub={`${items.length} ${filter === "open" ? "to handle" : "total"}`}>
        <div className="flex rounded-lg bg-navy-100 p-0.5 text-xs font-semibold">
          {["open", "all"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 capitalize ${filter === f ? "bg-white shadow-sm" : "text-navy-500"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </PageHead>

      <div className="space-y-3 p-5">
        {!items.length && <Empty icon="💬" title={filter === "open" ? "Inbox zero" : "No replies yet"} />}
        {items.map((it) => (
          <ReplyCard key={it.id} it={it} reload={reload} />
        ))}
      </div>
    </>
  );
}

function ReplyCard({ it, reload }) {
  const [reply, setReply] = useState(it.suggestedReply || "");
  const [busy, setBusy] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const longReply = (it.snippet || "").length > 320;

  async function act(action, body) {
    setBusy(action);
    try {
      const r = await post("/replies", { eventId: it.id, action, ...body });
      if (action === "regenerate") {
        if (r.pending) {
          toast("Queued — the home worker is on it…");
          const done = await pollJob(r.jobId);
          toast(done.ok ? "Re-classified" : done.error, done.ok ? "success" : "error");
          reload();
        } else {
          setReply(r.suggestedReply || "");
          toast(`Re-classified: ${r.intent}`, "success");
        }
      } else {
        toast("Done", "success");
        reload();
      }
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className={`p-4 ${it.handled ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-navy-900">{it.business}</span>
        {it.campaignName && <span className="text-xs text-navy-400">{it.campaignName}</span>}
        {it.type === "reply" && it.intent && (
          <Badge tone={INTENT_TONE[it.intent] || "gray"}>
            {it.intent.replace(/_/g, " ")}
            {it.confidence != null && ` ${Math.round(it.confidence * 100)}%`}
          </Badge>
        )}
        {it.type === "reply" && it.aiPending && <Badge tone="amber">classifying…</Badge>}
        {it.type === "bounce" && <Badge tone="rose">bounced</Badge>}
        {it.type === "auto_reply" && <Badge tone="gray">auto</Badge>}
        <span className="grow" />
        <span className="text-xs text-navy-400">{timeAgo(it.at)}</span>
      </div>

      {it.summary && <p className="mt-1 text-sm font-medium text-navy-700">{it.summary}</p>}

      <div
        className={`mt-2 whitespace-pre-wrap rounded-lg bg-navy-50 p-3 text-sm text-navy-600 ${
          expanded ? "max-h-none" : "max-h-40 overflow-y-auto"
        }`}
      >
        {it.snippet}
      </div>
      {longReply && (
        <button
          className="mt-1 text-xs font-semibold text-navy-500 hover:text-navy-800"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : "Show full message"}
        </button>
      )}

      {it.type === "reply" && it.intent !== "unsubscribe" && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-navy-400">Suggested reply</span>
            <Button size="sm" variant="ghost" onClick={() => act("regenerate")} disabled={busy === "regenerate"}>
              {busy === "regenerate" ? "…" : "Regenerate"}
            </Button>
          </div>
          <TextArea rows={5} value={reply} onChange={(e) => setReply(e.target.value)} className="font-sans text-sm" />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {it.type === "reply" && it.intent !== "unsubscribe" && (
          <Button size="sm" onClick={() => act("send_reply", { text: reply })} disabled={!!busy || !reply.trim()}>
            {busy === "send_reply" ? "Sending…" : "Send reply"}
          </Button>
        )}
        {!it.handled && (
          <Button size="sm" variant="ghost" onClick={() => act("mark_handled")} disabled={!!busy}>
            Mark handled
          </Button>
        )}
        {["won", "lost", "unsubscribed"].map((s) => (
          <Button key={s} size="sm" variant="outline" onClick={() => act("set_status", { status: s })} disabled={!!busy}>
            {s}
          </Button>
        ))}
      </div>
    </Card>
  );
}
