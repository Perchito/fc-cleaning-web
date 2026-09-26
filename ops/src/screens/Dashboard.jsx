import { useResource, pct } from "../api.js";
import { PageHead } from "../App.jsx";
import { Card, Loading, ErrorBox, StatTile, Badge } from "../ui.jsx";

export default function Dashboard() {
  const stats = useResource("/stats", { pollMs: 120000 });
  const prospects = useResource("/prospects", { pollMs: 90000 });

  if (stats.loading && !stats.data) return <Loading />;
  if (stats.error) return <ErrorBox error={stats.error} onRetry={stats.reload} />;

  const o = stats.data.overall;
  const all = prospects.data?.prospects || [];
  const newLeads = all.filter((p) => p.status === "draft");
  const fsaLeads = newLeads.filter((p) => p.fsaRating || p.source === "fsa");
  const awaitingResearch = all.filter((p) => !p.researchAt && p.status === "draft");
  const dueFollowUps = all.filter((p) => p.effectiveStatus === "follow_up_due");

  return (
    <>
      <PageHead title="Dashboard" sub="FC Cleaning – Commercial Prospects" />

      <div className="space-y-6 p-5">
        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="New leads" value={newLeads.length} sub={fsaLeads.length ? `${fsaLeads.length} from FSA` : "awaiting triage"} />
          <StatTile label="Emails sent" value={o.sent} sub={`${o.contacted} prospects contacted`} />
          <StatTile label="Reply rate" value={pct(o.replyRate)} tone="teal" sub={`${o.replies} replies · ${o.positive} positive`} />
          <StatTile label="Quotes pending" value={all.filter((p) => p.status === "quote_sent").length} tone="emerald" sub={`${o.won} won total`} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Follow-ups due */}
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-navy-400">Follow-ups due</span>
              <Badge tone="amber">{dueFollowUps.length}</Badge>
            </div>
            {dueFollowUps.length === 0 ? (
              <p className="text-sm text-navy-400">Nothing overdue — nice.</p>
            ) : (
              <ul className="divide-y divide-navy-100 text-sm">
                {dueFollowUps.slice(0, 8).map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <span className="min-w-0 truncate font-semibold text-navy-800">{p.business}</span>
                    <span className="ml-3 shrink-0 text-xs text-navy-400">
                      {p.nextActionChannel === "phone" ? "📞 call" : "✉️ email"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* AI enrichment queue */}
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-navy-400">AI enrichment queue</span>
              <Badge tone="purple">{awaitingResearch.length}</Badge>
            </div>
            {awaitingResearch.length === 0 ? (
              <p className="text-sm text-navy-400">Every draft lead is researched.</p>
            ) : (
              <ul className="divide-y divide-navy-100 text-sm">
                {awaitingResearch.slice(0, 8).map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <span className="min-w-0 truncate font-semibold text-navy-800">{p.business}</span>
                    <span className="ml-3 shrink-0 text-xs text-navy-400">{p.source || "manual"}</span>
                  </li>
                ))}
              </ul>
            )}
            {awaitingResearch.length > 0 && (
              <p className="mt-3 text-[11px] text-navy-400">
                Select them on the Prospects screen and hit Research to fill hooks, contacts and sites.
              </p>
            )}
          </Card>
        </div>

        {/* 14-day activity, lifted from Analytics */}
        <Activity data={stats.data} />
      </div>
    </>
  );
}

function Activity({ data }) {
  const maxAct = Math.max(1, ...data.activity.map((a) => a.sent));
  return (
    <Card className="p-4">
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-navy-400">Last 14 days</div>
      <div className="flex items-end gap-1.5" style={{ height: 100 }}>
        {data.activity.map((a) => (
          <div key={a.day} className="flex flex-1 flex-col items-center justify-end gap-0.5" title={`${a.day}: ${a.sent} sent, ${a.replies} replies`}>
            <div className="w-full rounded-t bg-navy-300" style={{ height: `${(a.sent / maxAct) * 80}px` }} />
            {a.replies > 0 && (
              <div className="w-full rounded-t bg-teal-500" style={{ height: `${(a.replies / maxAct) * 80}px` }} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-4 text-[11px] text-navy-400">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-navy-300" /> sent</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-teal-500" /> replies</span>
      </div>
    </Card>
  );
}
