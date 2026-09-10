import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import { useResource } from "./api.js";
import { Toaster } from "./ui.jsx";
import Queue from "./screens/Queue.jsx";
import Campaigns from "./screens/Campaigns.jsx";
import CampaignEditor from "./screens/CampaignEditor.jsx";
import Prospects from "./screens/Prospects.jsx";
import Replies from "./screens/Replies.jsx";
import Analytics from "./screens/Analytics.jsx";

const NAV = [
  { to: "/", label: "Queue", end: true },
  { to: "/campaigns", label: "Campaigns" },
  { to: "/prospects", label: "Prospects" },
  { to: "/replies", label: "Replies" },
  { to: "/analytics", label: "Analytics" },
];

export default function App() {
  // lightweight counts for the nav badges
  const queue = useResource("/queue", { pollMs: 60000 });
  const replies = useResource("/replies?filter=open", { pollMs: 60000 });
  const badges = {
    "/": queue.data?.counts?.total || 0,
    "/replies": replies.data?.items?.length || 0,
  };

  return (
    <div className="min-h-screen bg-navy-50">
      <div className="mx-auto flex max-w-7xl flex-col md:flex-row">
        {/* nav */}
        <aside className="md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-r md:border-navy-200 bg-white">
          <div className="flex items-center gap-2 px-5 pt-5 pb-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-navy-900 text-sm font-black text-white">
              FC
            </div>
            <div className="text-sm font-bold text-navy-900">Outreach</div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:gap-0.5 md:pb-0">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap transition ${
                    isActive ? "bg-navy-900 text-white" : "text-navy-600 hover:bg-navy-100"
                  }`
                }
              >
                {n.label}
                {badges[n.to] > 0 && (
                  <span className="ml-2 rounded-full bg-teal-500 px-1.5 text-[11px] font-bold text-white">
                    {badges[n.to]}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* content */}
        <main className="min-w-0 flex-1 pb-16">
          <Routes>
            <Route path="/" element={<Queue />} />
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
