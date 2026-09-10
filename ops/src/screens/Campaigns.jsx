import { Link } from "react-router-dom";
import { useResource, patch, toast } from "../api.js";
import { PageHead } from "../App.jsx";
import { Button, Badge, Card, Loading, ErrorBox, Empty } from "../ui.jsx";
import { pct } from "../api.js";

const STATUS_TONE = { draft: "gray", active: "green", paused: "amber", archived: "gray" };

export default function Campaigns() {
  const { data, loading, error, reload } = useResource("/campaigns", { pollMs: 60000 });

  async function toggle(c) {
    const next = c.status === "active" ? "paused" : "active";
    try {
      await patch(`/campaigns?id=${c.id}`, { status: next });
      toast(`${c.name} ${next}`, "success");
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const campaigns = data.campaigns || [];
  return (
    <>
      <PageHead title="Campaigns" sub={`${campaigns.length} total`}>
        <Link to="/campaigns/new">
          <Button size="sm">New campaign</Button>
        </Link>
      </PageHead>

      <div className="grid gap-3 p-5 sm:grid-cols-2">
        {!campaigns.length && (
          <div className="sm:col-span-2">
            <Empty icon="📣" title="No campaigns yet">
              A campaign is a sequence of emails. Create one, add steps, then enrol prospects.
            </Empty>
          </div>
        )}
        {campaigns.map((c) => (
          <Card key={c.id} className="flex flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link to={`/campaigns/${c.id}`} className="font-bold text-navy-900 hover:underline">
                  {c.name}
                </Link>
                {c.description && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-navy-500">{c.description}</p>
                )}
              </div>
              <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              <Metric label="steps" value={c.steps.length} />
              <Metric label="enrolled" value={c.stats.enrolled} />
              <Metric label="sent" value={c.stats.sent} />
              <Metric label="reply" value={pct(c.stats.replyRate)} tone="teal" />
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Link to={`/campaigns/${c.id}`}>
                <Button size="sm" variant="outline">
                  Edit
                </Button>
              </Link>
              {c.status !== "archived" && (
                <Button size="sm" variant="ghost" onClick={() => toggle(c)}>
                  {c.status === "active" ? "Pause" : "Activate"}
                </Button>
              )}
              <span className="grow" />
              <span className="text-[11px] text-navy-400">cap {c.dailyCap}/day</span>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

function Metric({ label, value, tone = "navy" }) {
  return (
    <div>
      <div className={`text-lg font-extrabold tabular-nums ${tone === "teal" ? "text-teal-600" : "text-navy-900"}`}>
        {value}
      </div>
      <div className="text-[10px] font-semibold uppercase text-navy-400">{label}</div>
    </div>
  );
}
