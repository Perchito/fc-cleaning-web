import { useMemo, useState } from "react";
import { useResource, api, post, toast, timeAgo, fmtDate } from "../api.js";
import { PageHead } from "../App.jsx";
import { Button, Badge, Card, Loading, ErrorBox, Empty, Modal, Drawer, Field, Input, Select, TextArea } from "../ui.jsx";

const STATUS_TONE = {
  draft: "gray",
  awaiting_reply: "blue",
  follow_up_due: "amber",
  replied: "green",
  won: "teal",
  lost: "gray",
  bounced: "rose",
  unsubscribed: "rose",
};

export default function Prospects() {
  const { data, loading, error, reload } = useResource("/prospects", { pollMs: 90000 });
  const campaigns = useResource("/campaigns");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sel, setSel] = useState(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    let r = data?.prospects || [];
    if (status) r = r.filter((p) => p.effectiveStatus === status);
    if (q.trim()) {
      const s = q.toLowerCase();
      r = r.filter(
        (p) =>
          p.business.toLowerCase().includes(s) ||
          (p.email || "").toLowerCase().includes(s) ||
          (p.location || "").toLowerCase().includes(s) ||
          (p.contactName || "").toLowerCase().includes(s),
      );
    }
    return r;
  }, [data, q, status]);

  const toggle = (id) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  async function enroll(campaignId) {
    setBusy(true);
    try {
      const r = await post("/enroll", { campaignId, prospectIds: [...sel] });
      toast(`Enrolled ${r.enrolled.length}${r.skipped.length ? `, skipped ${r.skipped.length}` : ""}`, "success");
      setSel(new Set());
      setEnrollOpen(false);
      reload();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function researchSelected() {
    setBusy(true);
    let done = 0;
    for (const id of sel) {
      try {
        await post("/enrich", { prospectId: id });
        done++;
      } catch {
        /* skip */
      }
    }
    toast(`Researched ${done}/${sel.size}`, "success");
    setBusy(false);
    setSel(new Set());
    reload();
  }

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  return (
    <>
      <PageHead title="Prospects" sub={`${data.total} total · ${rows.length} shown`}>
        <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
          Import CSV
        </Button>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          Add prospect
        </Button>
      </PageHead>

      <div className="flex flex-wrap items-center gap-2 border-b border-navy-100 bg-white px-5 py-2.5">
        <Input
          placeholder="Search business, email, contact, area…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[12rem]">
          <option value="">All statuses</option>
          {["draft", "awaiting_reply", "follow_up_due", "replied", "won", "lost", "bounced", "unsubscribed"].map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
        {sel.size > 0 && (
          <>
            <span className="text-sm font-semibold text-navy-600">{sel.size} selected</span>
            <Button size="sm" variant="subtle" onClick={() => setEnrollOpen(true)} disabled={busy}>
              Enrol in campaign
            </Button>
            <Button size="sm" variant="ghost" onClick={researchSelected} disabled={busy}>
              {busy ? "Researching…" : "Research"}
            </Button>
          </>
        )}
      </div>

      <div className="overflow-x-auto p-5">
        {!rows.length ? (
          <Empty icon="🔎" title="No prospects match" />
        ) : (
          <table className="w-full border-separate border-spacing-y-1 text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-navy-400">
              <tr>
                <th className="w-8"></th>
                <th className="px-2 py-1">Business</th>
                <th className="px-2 py-1">Contact</th>
                <th className="px-2 py-1">Area</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Last contact</th>
                <th className="px-2 py-1">Research</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="cursor-pointer bg-white hover:bg-navy-50" onClick={() => setDetail(p.id)}>
                  <td className="rounded-l-lg px-2" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />
                  </td>
                  <td className="px-2 py-2 font-semibold text-navy-900">{p.business}</td>
                  <td className="px-2 py-2 text-navy-500">{p.contactName || "—"}</td>
                  <td className="px-2 py-2 text-navy-500">{p.location || "—"}</td>
                  <td className="px-2 py-2">
                    <Badge tone={STATUS_TONE[p.effectiveStatus] || "gray"}>
                      {p.effectiveStatus.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="px-2 py-2 text-navy-500">{p.lastContactAt ? timeAgo(p.lastContactAt) : "—"}</td>
                  <td className="rounded-r-lg px-2 py-2">{p.research ? <Badge tone="teal">yes</Badge> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AddModal open={addOpen} onClose={() => setAddOpen(false)} onDone={reload} />
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        campaigns={campaigns.data?.campaigns || []}
        onDone={reload}
      />
      <Modal open={enrollOpen} onClose={() => setEnrollOpen(false)} title={`Enrol ${sel.size} prospect(s)`}>
        <div className="space-y-2">
          {(campaigns.data?.campaigns || []).map((c) => (
            <button
              key={c.id}
              onClick={() => enroll(c.id)}
              disabled={busy}
              className="flex w-full items-center justify-between rounded-lg border border-navy-200 px-3 py-2 text-left text-sm hover:bg-navy-50"
            >
              <span className="font-semibold">{c.name}</span>
              <Badge tone={c.status === "active" ? "green" : "gray"}>{c.status}</Badge>
            </button>
          ))}
          {!(campaigns.data?.campaigns || []).length && (
            <p className="text-sm text-navy-500">No campaigns yet — create one first.</p>
          )}
        </div>
      </Modal>

      <ProspectDrawer id={detail} onClose={() => setDetail(null)} onChange={reload} />
    </>
  );
}

function AddModal({ open, onClose, onDone }) {
  const [f, setF] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save() {
    if (!f.business || !f.email) return toast("Business and email required", "error");
    try {
      await post("/prospects", f);
      toast("Added", "success");
      setF({});
      onClose();
      onDone();
    } catch (e) {
      toast(e.message, "error");
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Add a prospect">
      <div className="grid gap-3">
        <Field label="Business"><Input value={f.business || ""} onChange={set("business")} /></Field>
        <Field label="Email"><Input value={f.email || ""} onChange={set("email")} /></Field>
        <Field label="Contact name"><Input value={f.contactName || ""} onChange={set("contactName")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><Input value={f.phone || ""} onChange={set("phone")} /></Field>
          <Field label="Area"><Input value={f.location || ""} onChange={set("location")} /></Field>
        </div>
        <Field label="Website"><Input value={f.website || ""} onChange={set("website")} /></Field>
        <Button onClick={save}>Add</Button>
      </div>
    </Modal>
  );
}

function ImportModal({ open, onClose, campaigns, onDone }) {
  const [csv, setCsv] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const r = await post("/import", { csv, campaignId: campaignId || undefined });
      setResult(r);
      toast(`Added ${r.added}`, "success");
      onDone();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Import prospects from CSV" wide>
      <div className="space-y-3">
        <p className="text-sm text-navy-500">
          Paste CSV with a header row. Columns like <code>business</code>, <code>email</code>,{" "}
          <code>contact</code>, <code>phone</code>, <code>website</code>, <code>area</code> are matched automatically.
        </p>
        <TextArea rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="business,email,contact,area&#10;The Foo,hello@foo.com,Jo,Ancoats" />
        <Field label="Enrol the new prospects into (optional)">
          <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">— don't enrol —</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button onClick={run} disabled={busy || !csv.trim()}>
          {busy ? "Importing…" : "Import"}
        </Button>
        {result && (
          <div className="rounded-lg bg-navy-50 p-3 text-sm">
            <b>{result.added}</b> added
            {result.enrolled && <> · {result.enrolled.enrolled.length} enrolled</>}
            {result.skipped.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs text-navy-500">
                {result.skipped.slice(0, 8).map((s, i) => (
                  <li key={i}>
                    row {s.row}: {s.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ProspectDrawer({ id, onClose, onChange }) {
  const { data, loading, reload } = useResource(id ? `/prospects?id=${id}` : null, { key: id, enabled: !!id });
  const [busy, setBusy] = useState(false);

  async function research() {
    setBusy(true);
    try {
      await post("/enrich", { prospectId: id });
      toast("Researched", "success");
      reload();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function setStatus(status) {
    await post("/status", { id, status });
    toast(`→ ${status}`, "success");
    reload();
    onChange();
  }

  const p = data?.prospect;
  return (
    <Drawer open={!!id} onClose={onClose} title={p?.business || "Prospect"}>
      {loading || !p ? (
        <Loading />
      ) : (
        <div className="space-y-4 text-sm">
          <div className="space-y-1 text-navy-600">
            <div className="break-anywhere">{p.email}</div>
            {p.contactName && <div>{p.contactName}</div>}
            {p.phone && <div>{p.phone}</div>}
            {[p.location, p.address].filter(Boolean).length > 0 && (
              <div>{[p.location, p.address].filter(Boolean).join(" · ")}</div>
            )}
            {p.website && (
              <a href={p.website} target="_blank" rel="noreferrer" className="text-teal-600 hover:underline">
                {p.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {["won", "lost", "unsubscribed", "awaiting_reply"].map((s) => (
              <Button key={s} size="sm" variant="outline" onClick={() => setStatus(s)}>
                {s.replace(/_/g, " ")}
              </Button>
            ))}
          </div>

          <Card className="p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-navy-400">Research</span>
              <Button size="sm" variant="ghost" onClick={research} disabled={busy}>
                {busy ? "…" : p.research ? "Re-run" : "Research now"}
              </Button>
            </div>
            {p.research ? (
              <div className="space-y-1 text-navy-600">
                <p>{p.research.summary}</p>
                {p.research.cleaningNeeds?.length > 0 && (
                  <p className="text-xs">
                    Needs: {p.research.cleaningNeeds.join(", ")}
                  </p>
                )}
                <p className="text-xs text-navy-400">hook: {p.hook || "—"}</p>
              </div>
            ) : (
              <p className="text-navy-400">Not researched yet.</p>
            )}
          </Card>

          {data.sends?.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-bold uppercase text-navy-400">
                Emails sent ({data.sends.length})
              </div>
              <div className="space-y-1.5">
                {data.sends.map((s) => (
                  <SentEmail key={s.id} s={s} />
                ))}
              </div>
            </div>
          )}

          {data.enrollments.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-bold uppercase text-navy-400">Campaigns</div>
              {data.enrollments.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-1">
                  <span>{e.campaignName}</span>
                  <Badge tone={e.status === "active" ? "green" : "gray"}>
                    {e.status} · step {e.currentStep + 1}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          <div>
            <div className="mb-1 text-xs font-bold uppercase text-navy-400">Timeline</div>
            <ol className="space-y-2">
              {data.timeline.map((t, i) => (
                <li key={i} className="border-l-2 border-navy-200 pl-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={t.type === "reply" ? "green" : t.type === "bounce" ? "rose" : "gray"}>{t.type}</Badge>
                    {t.intent && <span className="text-xs text-navy-500">{t.intent}</span>}
                    <span className="text-xs text-navy-400">{timeAgo(t.at)}</span>
                  </div>
                  {t.subject && <div className="text-navy-700">{t.subject}</div>}
                  {t.snippet && <div className="text-xs text-navy-500 line-clamp-3">{t.snippet}</div>}
                </li>
              ))}
              {!data.timeline.length && <li className="text-navy-400">No activity yet.</li>}
            </ol>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function SentEmail({ s }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-2.5">
      <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen((o) => !o)}>
        <span className="text-navy-300">{open ? "▾" : "▸"}</span>
        <Badge tone="gray">step {s.stepIndex != null ? s.stepIndex + 1 : "—"}</Badge>
        {s.variantKey && <Badge tone="purple">{s.variantKey}</Badge>}
        {s.aiGenerated && <Badge tone="teal">AI</Badge>}
        <span className="grow truncate font-medium text-navy-800">{s.subject}</span>
        <span className="shrink-0 text-xs text-navy-400">{fmtDate(s.sentAt)}</span>
      </button>
      {open && (
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-navy-50 p-2.5 font-sans text-[13px] leading-relaxed text-navy-700">
          {s.body || "(body not stored — the Sent mailbox didn't have this message)"}
        </pre>
      )}
    </Card>
  );
}
