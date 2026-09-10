import { useMemo, useState } from "react";
import { useResource, post, toast } from "../api.js";
import { PageHead } from "../App.jsx";
import { Button, Badge, Card, Loading, ErrorBox, Empty, TextArea, Input, Modal } from "../ui.jsx";

export default function Queue() {
  const { data, loading, error, reload } = useResource("/queue", { pollMs: 45000 });
  const [busy, setBusy] = useState(null);
  const [send, setSend] = useState(null); // {total, done, sent, failed, remaining}

  const groups = useMemo(() => {
    const g = {};
    for (const it of data?.items || []) (g[it.campaignName || "—"] ||= []).push(it);
    return g;
  }, [data]);

  async function act(action, ids, patch) {
    setBusy(action + (ids || []).join());
    try {
      await post("/queue", { action, ids, patch });
      await reload();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function build() {
    setBusy("build");
    try {
      const r = await post("/queue", { action: "build" });
      toast(`Queued ${r.queued} email${r.queued === 1 ? "" : "s"}${r.aiDrafts ? ` (${r.aiDrafts} AI-drafted)` : ""}`, "success");
      await reload();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function runSend() {
    const approved = (data.items || []).filter((i) => i.status === "approved").length;
    if (!approved) return toast("Nothing approved to send", "error");
    setSend({ total: approved, done: 0, sent: 0, failed: 0, remaining: approved });
    let remaining = approved;
    try {
      while (remaining > 0) {
        const r = await post("/sender", { batch: 3 });
        const sent = r.results.filter((x) => x.sent).length;
        const failed = r.results.filter((x) => x.error).length;
        setSend((s) => ({
          ...s,
          done: s.done + r.results.length,
          sent: s.sent + sent,
          failed: s.failed + failed,
          remaining: r.remaining,
        }));
        remaining = r.remaining;
        if (remaining > 0) await new Promise((res) => setTimeout(res, 45000)); // space the batches
      }
      toast("Batch sent", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      await reload();
      setTimeout(() => setSend(null), 2500);
    }
  }

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const c = data.counts;
  return (
    <>
      <PageHead
        title="Queue"
        sub={`${data.day} · ${c.total} email${c.total === 1 ? "" : "s"} · ${c.approved} approved${c.blocked ? ` · ${c.blocked} need fixing` : ""}`}
      >
        <Button variant="outline" size="sm" onClick={build} disabled={busy === "build"}>
          {busy === "build" ? "Building…" : "Build queue"}
        </Button>
        {c.queued > 0 && (
          <Button variant="subtle" size="sm" onClick={() => act("approve_all")} disabled={!!busy}>
            Approve all ({c.queued})
          </Button>
        )}
        <Button variant="teal" size="sm" onClick={runSend} disabled={!!send || c.approved === 0}>
          Send approved ({c.approved})
        </Button>
      </PageHead>

      <div className="space-y-6 p-5">
        {!data.items.length && (
          <Empty icon="✉️" title="Nothing queued for today">
            Hit <b>Build queue</b> to pull in everyone due, or enrol prospects into an active campaign.
          </Empty>
        )}
        {Object.entries(groups).map(([name, items]) => (
          <div key={name}>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-navy-400">
              {name} <span className="text-navy-300">· {items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((it) => (
                <QueueItem key={it.id} item={it} busy={busy} act={act} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!send} onClose={() => {}} title="Sending approved batch">
        {send && (
          <div className="text-sm">
            <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-navy-100">
              <div
                className="h-full bg-teal-500 transition-all"
                style={{ width: `${Math.round((send.done / send.total) * 100)}%` }}
              />
            </div>
            <p>
              {send.sent} sent · {send.failed} failed · {send.remaining} to go
            </p>
            {send.remaining > 0 && (
              <p className="mt-2 text-xs text-navy-400">
                Pausing ~45s between batches to keep deliverability healthy — keep this tab open.
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

function QueueItem({ item, busy, act }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(item.subject);
  const [body, setBody] = useState(item.body);
  const dirty = subject !== item.subject || body !== item.body;
  const blocked = item.unresolved.length > 0;

  return (
    <Card className={`p-3.5 ${item.status === "failed" ? "border-rose-300" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-navy-900">{item.business}</span>
        {item.contactName && <span className="text-xs text-navy-400">{item.contactName}</span>}
        <span className="text-xs text-navy-400 break-anywhere">{item.email}</span>
        <span className="grow" />
        <Badge tone="gray">step {item.stepIndex + 1}</Badge>
        {item.variantKey && <Badge tone="purple">{item.variantKey}</Badge>}
        {item.aiGenerated && <Badge tone="teal">AI</Badge>}
        {item.aiPending && <Badge tone="amber">AI draft generating…</Badge>}
        {item.status === "approved" && <Badge tone="green">approved</Badge>}
        {item.status === "failed" && <Badge tone="rose">failed</Badge>}
        {blocked && <Badge tone="amber">missing: {item.unresolved.join(", ")}</Badge>}
      </div>

      <button
        className="mt-1.5 block w-full text-left text-sm text-navy-700 hover:text-navy-900"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="font-medium">{subject}</span>
        <span className="ml-2 text-navy-300">{open ? "▾" : "▸"}</span>
      </button>

      {item.error && <div className="mt-1 text-xs text-rose-600 break-anywhere">{item.error}</div>}

      {open && (
        <div className="mt-2 space-y-2">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          <TextArea value={body} onChange={(e) => setBody(e.target.value)} rows={12} />
          {dirty && (
            <Button
              size="sm"
              variant="subtle"
              onClick={() => act("edit", [item.id], { subject, body }).then(() => setOpen(false))}
            >
              Save edits
            </Button>
          )}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {item.status === "queued" && (
          <Button
            size="sm"
            onClick={() => act("approve", [item.id])}
            disabled={!!busy || blocked || dirty || item.aiPending}
          >
            Approve
          </Button>
        )}
        {item.status === "approved" && (
          <Button size="sm" variant="ghost" onClick={() => act("unapprove", [item.id])} disabled={!!busy}>
            Unapprove
          </Button>
        )}
        {item.status === "failed" && (
          <Button size="sm" onClick={() => act("retry", [item.id])} disabled={!!busy}>
            Retry
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => act("skip", [item.id])} disabled={!!busy}>
          Skip
        </Button>
        <Button size="sm" variant="ghost" onClick={() => act("snooze", [item.id])} disabled={!!busy}>
          Snooze 1d
        </Button>
      </div>
    </Card>
  );
}
