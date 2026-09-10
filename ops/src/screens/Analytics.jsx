import { useResource, pct } from "../api.js";
import { PageHead } from "../App.jsx";
import { Card, Loading, ErrorBox, StatTile, Badge } from "../ui.jsx";

export default function Analytics() {
  const { data, loading, error, reload } = useResource("/stats", { pollMs: 120000 });
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const o = data.overall;
  const maxAct = Math.max(1, ...data.activity.map((a) => a.sent));

  return (
    <>
      <PageHead title="Analytics" />
      <div className="space-y-6 p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Prospects" value={o.prospects} sub={`${o.draft} not contacted`} />
          <StatTile label="Contacted" value={o.contacted} />
          <StatTile label="Emails sent" value={o.sent} />
          <StatTile label="Replies" value={o.replies} tone="teal" sub={pct(o.replyRate) + " reply rate"} />
          <StatTile label="Positive" value={o.positive} tone="emerald" sub="interested / meeting" />
          <StatTile label="Suppressed" value={o.suppressed} tone="rose" sub={`${o.bounces} bounced`} />
        </div>

        <Card className="p-4">
          <div className="mb-3 text-xs font-bold uppercase tracking-wide text-navy-400">Last 14 days</div>
          <div className="flex items-end gap-1.5" style={{ height: 120 }}>
            {data.activity.map((a) => (
              <div key={a.day} className="flex flex-1 flex-col items-center justify-end gap-0.5" title={`${a.day}: ${a.sent} sent, ${a.replies} replies`}>
                <div className="w-full rounded-t bg-navy-300" style={{ height: `${(a.sent / maxAct) * 90}px` }} />
                {a.replies > 0 && (
                  <div className="w-full rounded-t bg-teal-500" style={{ height: `${(a.replies / maxAct) * 90}px` }} />
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-4 text-[11px] text-navy-400">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded bg-navy-300" /> sent
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded bg-teal-500" /> replies
            </span>
          </div>
        </Card>

        <Card className="overflow-x-auto p-4">
          <div className="mb-3 text-xs font-bold uppercase tracking-wide text-navy-400">By campaign</div>
          {!data.campaigns.length ? (
            <p className="text-sm text-navy-400">No campaigns yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase text-navy-400">
                <tr>
                  <th className="py-1 pr-3">Campaign</th>
                  <th className="px-2">Enrolled</th>
                  <th className="px-2">Sent</th>
                  <th className="px-2">Replies</th>
                  <th className="px-2">Positive</th>
                  <th className="w-40 px-2">Reply rate</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((c) => (
                  <tr key={c.id} className="border-t border-navy-100">
                    <td className="py-2 pr-3 font-semibold text-navy-900">
                      {c.name} <Badge tone={c.status === "active" ? "green" : "gray"}>{c.status}</Badge>
                    </td>
                    <td className="px-2 tabular-nums">{c.enrolled}</td>
                    <td className="px-2 tabular-nums">{c.sent}</td>
                    <td className="px-2 tabular-nums">{c.replies}</td>
                    <td className="px-2 tabular-nums">{c.positive}</td>
                    <td className="px-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-navy-100">
                          <div className="h-full bg-teal-500" style={{ width: pct(Math.min(1, c.replyRate * 2)) }} />
                        </div>
                        <span className="tabular-nums text-navy-500">{pct(c.replyRate)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {data.variants.length > 0 && (
          <Card className="p-4">
            <div className="mb-3 text-xs font-bold uppercase tracking-wide text-navy-400">A/B variants</div>
            <table className="text-sm">
              <thead className="text-left text-[11px] uppercase text-navy-400">
                <tr>
                  <th className="py-1 pr-4">Step</th>
                  <th className="pr-4">Variant</th>
                  <th className="pr-4">Sent</th>
                  <th className="pr-4">Replied</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.variants.map((v, i) => (
                  <tr key={i} className="border-t border-navy-100">
                    <td className="py-1.5 pr-4">step {v.stepIndex + 1}</td>
                    <td className="pr-4">
                      <Badge tone="purple">{v.variantKey}</Badge>
                    </td>
                    <td className="pr-4 tabular-nums">{v.sent}</td>
                    <td className="pr-4 tabular-nums">{v.replied}</td>
                    <td className="tabular-nums">{v.sent ? pct(v.replied / v.sent) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  );
}
