# FC Home Server — outreach on your own Ubuntu box

Runs the outreach section of this repo (the `/ops` dashboard, the
`/api/outreach` API, the daily jobs and the AI worker) on an Ubuntu server at
home. It uses a **local PostgreSQL** database instead of Neon and **local disk
storage** for files and backups. A **web control panel** lets you manage all of it.

The public marketing site stays on Vercel. Only the outreach tool moves.

```
                   Ubuntu home server
 ┌──────────────────────────────────────────────────────────────┐
 │  fc-panel            :8090   control panel (this folder)     │
 │  fc-outreach-app     :4517   /ops dashboard + /api/outreach  │
 │                              + daily cron & discover jobs    │
 │  fc-outreach-worker          AI jobs → headless Claude Code  │
 │  postgresql          :5432   database "fc_outreach" (local)  │
 │  fc-outreach-backup.timer    nightly pg_dump → storage       │
 │                                                              │
 │  /srv/fc-outreach/storage/   files/   backups/               │
 │  /etc/fc-outreach/outreach.env   settings + secrets          │
 └──────────────────────────────────────────────────────────────┘
```

## Install (about 5 minutes)

On the Ubuntu server (22.04 or 24.04), logged in as your normal user:

```bash
git clone https://github.com/Perchito/fc-cleaning-web.git ~/fc-cleaning-web
cd ~/fc-cleaning-web
sudo bash homeserver/install.sh            # add --tailscale for remote access
```

When it finishes it prints the panel URL and the generated passwords. Keep a copy of them.
You can re-run the installer at any time. It keeps your database, settings and files.

## First-run checklist (all in the control panel)

1. **Open the panel** at `http://<server-ip>:8090` and sign in with `PANEL_PASS`.
2. **Settings:** fill in `ICLOUD_SMTP_USER` and `ICLOUD_SMTP_PASS` (the Apple
   app-specific password) and `DIGEST_TO`, then **Save** (the app and worker restart).
3. **Database → Move data from Neon:** paste the Neon **direct** connection
   string (Neon console → Connect → turn off "Connection pooling"). Your
   existing prospects, campaigns and send history are copied into the local database.
4. **Stop Vercel's copy** so the two copies don't both email the daily digest
   or poll the inbox. Remove the `crons` block from `vercel.json` (or delete
   `CRON_SECRET` in Vercel), and from now on use `/ops` on the home server.
5. **AI (optional):** on the server run `claude login` as your user (install
   Claude Code first if you need to). Then in Settings set `OUTREACH_AI=on` and
   start **AI worker** on the Overview page. AI drafts then use your Claude
   subscription, not API credits.
   - The **discover** daily job (lead finding) still needs `ANTHROPIC_API_KEY`,
     as it does on Vercel. If you don't set a key, change `DAILY_JOBS` to `cron`.

## What the control panel does

| Page | What you can do |
|---|---|
| **Overview** | See host CPU, memory and disk, and whether the app is up. Start, stop or restart each service. Buttons: check inbox now, run the daily job, find leads, back up the database, **Update from GitHub** (git pull, npm ci, rebuild, restart) |
| **Services & logs** | Status, memory and restart count for each service. Live `journalctl` logs |
| **Database** | Size, row count per table, AI job queue. Backups: create, download, **restore** (a safety backup is taken first), delete. Neon import |
| **Storage** | A file store on the server's disk. Upload (including drag and drop), download, create folders, delete |
| **Settings** | Edit `/etc/fc-outreach/outreach.env`. Secrets are never shown: leave a field blank to keep its value, or type to replace it |

The panel runs as your user. The only root access it has is to run
`systemctl start|stop|restart` on its own services (`/etc/sudoers.d/fc-outreach`).

## Reaching it from outside the house

**Tailscale (recommended: private, nothing exposed to the internet).**
Install it with `--tailscale` (or `curl -fsSL https://tailscale.com/install.sh | sh`),
then run `sudo tailscale up`. Install the Tailscale app on your phone and laptop.
After that, `http://<server-name>:4517/ops` and `:8090` work from anywhere.

**Cloudflare Tunnel (a public HTTPS URL such as `ops.fccleaningcompany.com`).**
`/ops` has Basic auth, so this is fine for the dashboard. Keep the **panel**
on Tailscale or the LAN only.

```bash
# on the server, once cloudflared is installed (https://pkg.cloudflare.com)
cloudflared tunnel login
cloudflared tunnel create fc-ops
cloudflared tunnel route dns fc-ops ops.fccleaningcompany.com
# ~/.cloudflared/config.yml → ingress: - hostname: ops.fccleaningcompany.com
#                                        service: http://localhost:4517
#                              - service: http_status:404
sudo cloudflared service install
```

Then set `OPS_PUBLIC_URL=https://ops.fccleaningcompany.com` in Settings. The
panel shows `cloudflared` as a service once it is installed.

If `ufw` is on, allow LAN access with:
`sudo ufw allow from 192.168.0.0/16 to any port 4517,8090 proto tcp`

## Command line equivalents

```bash
systemctl status fc-outreach-app fc-outreach-worker fc-panel postgresql
journalctl -u fc-outreach-app -f
homeserver/scripts/backup.sh                     # back up now
homeserver/scripts/restore.sh /srv/fc-outreach/storage/backups/<file>.sql.gz
homeserver/scripts/import-from-neon.sh '<neon direct url>'
homeserver/scripts/update.sh                     # pull + rebuild + restart
```

## How it fits the existing code

- `api/outreach/_lib/db.js` uses the Neon driver by default (Vercel is
  unchanged). With `DB_DRIVER=pg` it uses `pg` against a normal Postgres
  instead. Both expose the same `sql` interface.
- `app-server.mjs` runs the **same** `api/outreach/[[...path]].js` handler
  that Vercel runs. It adds Vercel's `req.query`, `req.body`, `res.status` and
  `res.json`, and copies the Basic-auth rules in `middleware.js`. It serves the
  `dist/ops` build and replaces Vercel Cron: `DAILY_JOBS` run at `DAILY_AT`
  in `DAILY_TZ` (08:00 Europe/London by default).
- `worker/outreach-worker.mjs` is unchanged. It is pointed at
  `SITE_URL=http://127.0.0.1:4517`, so it never leaves the machine.
- The old macOS `outreach/` app is not used here.
