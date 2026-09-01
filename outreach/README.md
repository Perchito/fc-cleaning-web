# FC Outreach — cold-email tracker

A small local web app that tracks the cold emails you send to prospects,
watches the iCloud inbox for replies, and lets you fire a drafted follow-up
from the dashboard with one click (you review the draft before it sends).

It reuses the same iCloud SMTP account as the `icloud-email` MCP server —
the password is **not** copied here; it's read at runtime from
`~/.claude/mcp-servers/icloud-email/.env`.

## What it does

- **Logs every send** (initial + follow-ups) with its Message-ID.
- **Polls the inbox** (`imap.mail.me.com`) and reconciles messages against
  what you sent:
  - real reply → prospect marked **Replied** (with a snippet)
  - auto-acknowledgement / out-of-office → recorded as "email landed", status
    unchanged (still needs a real follow-up)
  - mailer-daemon bounce → marked **Bounced**
- **Follow-up due** — anything with no real reply after `FOLLOWUP_INTERVAL_DAYS`
  (default 5) and follow-ups remaining is flagged.
- **Send follow-up button** — opens the drafted follow-up (tailored to the
  business, editable), you confirm, it sends threaded onto the original.
- **Daily digest** — once a day it emails you a summary of new replies and
  follow-ups due (`POLL_CRON`, default 08:00).

## Setup

```bash
cd outreach
npm install
cp .env.example .env          # then set DASHBOARD_TOKEN (generator command is in the file)
npm start                     # http://localhost:4517/?token=YOUR_TOKEN
```

The `icloud-email` MCP server must already be configured (it is — that's how
the earlier emails were sent).

## Run it always-on (macOS)

```bash
npm run install-service       # installs a launchd agent: starts at login, restarts on crash
tail -f data/server.log       # watch it
launchctl unload ~/Library/LaunchAgents/com.fccleaning.outreach.plist   # stop
```

## Open it from your phone / laptop

The server listens on all interfaces, so once it's running any device on the
same network can reach `http://<this-mac-ip>:4517/?token=…`.

For access **anywhere** (recommended: Tailscale — private, no public exposure):

```bash
brew install tailscale
sudo tailscale up             # sign in (opens a browser)
```

Install the Tailscale app on your phone, sign in with the same account, then
open `http://<mac-name>:4517/?token=YOUR_TOKEN` — bookmark it. The token is
the only thing between a device and your outbox, so keep the URL private.

## Data

Everything in `data/` is git-ignored (it holds your prospect list and send
history — not for version control).

- `data/prospects.json` — live state: prospects, statuses, follow-up counts, replies
- `data/sends.jsonl` — append-only log of every email sent
- `data/server.log` — service output

Back this folder up occasionally (e.g. copy it to iCloud Drive). If
`prospects.json` is missing on start, the app begins with an empty list.

## Files

| File | Purpose |
|---|---|
| `server.mjs` | Express app + routes + daily cron |
| `lib/config.mjs` | settings; borrows iCloud creds from the MCP server |
| `lib/store.mjs` | JSON store + status derivation |
| `lib/mailer.mjs` | SMTP send + send log |
| `lib/imap.mjs` | inbox poll + reply/ack/bounce reconciliation |
| `lib/templates.mjs` | initial + follow-up email drafting |
| `public/` | the dashboard (vanilla JS, no build) |

## Sending discipline

iCloud SMTP is not a bulk sender (~500 recipients/day, shared-domain
reputation). Keep new outreach to a handful a day and space it out.
