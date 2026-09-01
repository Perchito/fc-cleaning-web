# Outreach — hosted on the website (`/ops`)

The cold-outreach tracker, running as part of fccleaningcompany.com instead of
on a laptop. Hidden page at **`/ops`**, protected by HTTP Basic auth.

```
public/ops/            the dashboard (static: index.html, app.js, styles.css)
api/outreach/*.js       serverless functions
api/outreach/_lib/      shared code (config, Blob store, mailer, imap, templates, digest, seed)
middleware.js           Basic-auth gate for /ops and /api/outreach/* (repo root)
vercel.json             /ops rewrite + daily cron + function maxDuration (repo root)
```

## Endpoints (all under Basic auth except `cron`)

| Method + path | Purpose |
|---|---|
| `GET /api/outreach/prospects` | list + counts |
| `POST /api/outreach/prospects` | add `{business,email,contactName?}` |
| `GET /api/outreach/draft?id=` | build the next email (initial or follow-up) |
| `POST /api/outreach/send` | `{id,subject,text}` — sends + logs, threaded |
| `POST /api/outreach/status` | `{id,status?,notes?}` |
| `POST /api/outreach/call` | `{id,note?,outcome?}` — log a phone follow-up |
| `POST /api/outreach/poll` | check the inbox now |

Prospect fields include `address`, `location`, `phone`, `calls[]`, and
`preferredChannel` (`"email"`/`"phone"`, optional override). The dashboard
shows a next-action recommendation: first nudge by email, subsequent nudges
by phone (escalation), with a suggested date = last contact + interval.
| `GET  /api/outreach/cron` | daily job (Vercel Cron) — poll + digest email; auth = `Bearer $CRON_SECRET` |

## Storage

One JSON file in **Vercel Blob** (`outreach/prospects.json`). On first run,
if the blob doesn't exist it's seeded from `_lib/seed.js` (the 5 prospects
contacted 2026-08-31). Back it up occasionally via the Blob dashboard.

## Required environment variables (Vercel → Settings → Environment Variables)

| Var | Value |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | auto-added when you create the Blob store |
| `ICLOUD_SMTP_USER` | Apple ID / iCloud address (copy from `~/.claude/mcp-servers/icloud-email/.env`) |
| `ICLOUD_SMTP_PASS` | Apple app-specific password (same source) |
| `OPS_USER` | dashboard login name (e.g. `fc`) |
| `OPS_PASS` | dashboard password |
| `CRON_SECRET` | random string — gates the cron endpoint |
| `DIGEST_TO` | where the daily summary email goes |

Optional overrides: `ICLOUD_FROM_ADDRESS`, `ICLOUD_FROM_NAME`, `REPLY_TO`,
`FOLLOWUP_INTERVAL_DAYS`, `MAX_FOLLOWUPS`, `POSTAL_ADDRESS`, `PHONE`,
`WEBSITE`, `SENDER_FIRST_NAME`.

## Cron timing

`vercel.json` → `0 8 * * *` = 08:00 **UTC** daily (09:00 UK in summer).
Hobby plan runs it once a day and may delay it up to ~1 hour.

## Local dev

`outreach/` still contains the standalone Express version for local testing.
The hosted version is the one that matters now.
