// HTTP Basic auth for the hidden outreach section. Everything under /ops and
// /api/outreach/* is gated, except the cron endpoint (which authenticates
// itself with CRON_SECRET).

export const config = {
  matcher: ["/ops", "/ops/:path*", "/api/outreach/:path*"],
};

export default function middleware(req) {
  const { pathname } = new URL(req.url);
  if (pathname === "/api/outreach/cron") return; // self-authenticated

  const user = process.env.OPS_USER || "fc";
  const pass = process.env.OPS_PASS || "";
  const header = req.headers.get("authorization") || "";

  if (pass && header.startsWith("Basic ")) {
    let decoded = "";
    try {
      decoded = atob(header.slice(6));
    } catch {
      /* fall through to 401 */
    }
    const i = decoded.indexOf(":");
    const u = decoded.slice(0, i);
    const p = decoded.slice(i + 1);
    if (u === user && p === pass) return; // authorised
  }

  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="FC Outreach", charset="UTF-8"',
      "Cache-Control": "no-store",
      "X-Debug-HasPass": pass ? "yes" : "no",
      "X-Debug-HasUser": process.env.OPS_USER ? "yes" : "no",
      "X-Debug-GotAuth": header ? "yes" : "no",
      "X-Debug-AuthScheme": header.split(" ")[0] || "none",
    },
  });
}
