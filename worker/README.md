# FC Outreach — home worker

Runs the AI side of the outreach tool (email drafting, reply classification,
prospect research, lead discovery) on **your Claude subscription** instead of
paying per token for the Anthropic API.

The site drops jobs in a queue (`ai_jobs` table). This script, on an always-on
machine, claims them, runs each through **headless Claude Code**, and posts the
answer back. It only makes **outbound** HTTPS calls — no ports to open, no
tunnel, no SSH.

If this machine is asleep or offline, nothing breaks: queued emails keep their
plain-template version, replies stay unclassified, and everything catches up
when the worker is back.

## One-time setup on the always-on machine

1. **Node 18+** and the **Claude Code CLI**:
   ```
   npm install -g @anthropic-ai/claude-code    # or however you install it
   claude login                                 # sign in with your Claude account
   ```
   Run `claude -p "say hi"` once to confirm it works non-interactively.

2. **Get the files** — either clone this repo, or just copy `outreach-worker.mjs`
   somewhere.

3. **Set two env vars** and start it:
   ```
   export SITE_URL=https://www.fccleaningcompany.com
   export WORKER_SECRET=<the same random string you put in Vercel>
   node outreach-worker.mjs
   ```

## Enabling it

In Vercel → the `fc-cleaning-web` project → Settings → Environment Variables
(Production):

| Var | Value |
|---|---|
| `OUTREACH_AI` | `on` |
| `AI_BACKEND` | `worker` |
| `WORKER_SECRET` | a long random string (same as on the machine) |

Then redeploy. With `AI_BACKEND=worker` the site never calls the Anthropic API —
it only enqueues jobs for this worker.

## Keeping it running

- **macOS:** `caffeinate -s node outreach-worker.mjs`, or a LaunchAgent.
- **Linux:** a `systemd` service, or `pm2 start outreach-worker.mjs`.
- **Anything:** `while true; do node outreach-worker.mjs; sleep 5; done`

## What it costs you

Claude subscription usage only. Rough volume: a full day of the outreach tool is
~25 email drafts + a handful of reply classifications — comfortably inside a Max
plan; a Pro plan is fine on a normal day, tighter on a big one.

## Watching it

- Worker logs each job: `✓ draft a1b2c3d4 (18s)`.
- The site's `/ops` → Queue shows an "AI draft generating…" badge until the
  worker fills a draft in; Replies shows "classifying…".
- `GET /api/outreach/jobs?id=<uuid>` (Basic auth) shows one job's status.
