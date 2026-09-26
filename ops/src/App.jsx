import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import { useResource } from "./api.js";
import { Toaster } from "./ui.jsx";
import Dashboard from "./screens/Dashboard.jsx";
import Pipeline from "./screens/Pipeline.jsx";
import Queue from "./screens/Queue.jsx";
import Campaigns from "./screens/Campaigns.jsx";
import CampaignEditor from "./screens/CampaignEditor.jsx";
import Prospects from "./screens/Prospects.jsx";
import Replies from "./screens/Replies.jsx";
import Analytics from "./screens/Analytics.jsx";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/pipeline", label: "Pipeline" },
  { to: "/queue", label: "Send Queue" },
  { to: "/campaigns", label: "Sequences" },
  { to: "/prospects", label: "Prospects" },
  { to: "/replies", label: "Conversations" },
  { to: "/analytics", label: "Analytics" },
];

export default function App() {
  // lightweight counts for the nav badges
  const queue = useResource("/queue", { pollMs: 60000 });
  const replies = useResource("/replies?filter=open", { pollMs: 60000 });
  const badges = {
    "/queue": queue.data?.counts?.total || 0,
    "/replies": replies.data?.items?.length || 0,
  };

  return (
    <div className="min-h-screen bg-navy-50">
      <div className="flex flex-col md:flex-row">
        {/* dark sidebar */}
        <aside className="bg-navy-950 text-navy-100 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0">
          <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-teal-500 text-sm font-black text-navy-950">
              FC
            </div>
            <div>
              <div className="text-sm font-extrabold leading-tight text-white">FC Cleaning</div>
              <div className="text-[11px] font-medium leading-tight text-navy-300">Commercial Prospects</div>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:gap-0.5 md:pb-0">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap transition ${
                    isActive
                      ? "bg-navy-800 text-white shadow-inner"
                      : "text-navy-300 hover:bg-navy-900 hover:text-white"
                  }`
                }
              >
                {n.label}
                {badges[n.to] > 0 && (
                  <span className="ml-2 rounded-full bg-teal-500 px-1.5 text-[11px] font-bold text-navy-950">
                    {badges[n.to]}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="hidden px-5 pt-6 text-[11px] leading-relaxed text-navy-400 md:block">
            <p>Daily FSA pull + AI discover run at 9am.</p>
            <p className="mt-1">Nothing sends without your approval in the Queue.</p>
          </div>
        </aside>

        {/* content */}
        <main className="min-w-0 flex-1 pb-16">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/campaigns/:id" element={<CampaignEditor />} />
            <Route path="/campaigns/new" element={<CampaignEditor />} />
            <Route path="/prospects" element={<Prospects />} />
            <Route path="/replies" element={<Replies />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <Toaster />
    </div>
  );
}

export function PageHead({ title, sub, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-navy-200 bg-white px-5 py-4">
      <div>
        <h1 className="text-lg font-extrabold text-navy-900">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-navy-500">{sub}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
