# FC Home Server — your own Ubuntu box for outreach and your other repos

Turns an Ubuntu server at home into:

1. **The host for this repo's outreach tool** (the `/ops` dashboard, the
   `/api/outreach` API, the daily jobs and the AI worker). It uses a local
   PostgreSQL database instead of Neon. The public marketing site stays on Vercel.
2. **Database + file storage for any of your other repos.** In the panel,
   each repo gets a **project** with its own PostgreSQL database and its own
   storage bucket (a small S3-style HTTP API with keys and signed URLs).

A **web control panel** manages all of it.

```
                   Ubuntu home server
 ┌──────────────────────────────────────────────────────────────┐
 │  fc-panel            :8090   control panel (this folder)     │
 │  fc-outreach-app     :4517   /ops dashboard + /api/outreach  │
 │                              + daily cron & discover jobs    │
 │  fc-outreach-worker          AI jobs → headless Claude Code  │
 │  fc-storage          :9100   storage API: /v1/<project>/…    │
 │  postgresql          :5432   "fc_outreach" + one database    │
 │                              per project (p_<project>)       │
 │  fc-outreach-backup.timer    nightly pg_dump of every DB     │
 │                                                              │
 │  /srv/fc-outreach/storage/   files/ backups/ projects/ trash/│
 │  /etc/fc-outreach/outreach.env   settings + secrets          │
 │  /etc/fc-outreach/projects.json  projects, keys, DB logins   │
 └──────────────────────────────────────────────────────────────┘
```

## Install (about 5 minutes)

On the Ubuntu server (22.04 or newer, including 26.04), logged in as your normal user:

```bash
git clone https://github.com/Perchito/fc-cleaning-web.git ~/fc-cleaning-web
cd ~/fc-cleaning-web
sudo bash homeserver/install.sh --tailscale --db-network
```

- `--tailscale` installs Tailscale for private remote access.
- `--db-network` lets project databases accept connections from your LAN and
  Tailscale (only project logins, with password auth). Leave it off if every
  app runs on the server itself.

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

## Using it for your other repos

Panel → **Projects** → **New project**, e.g. "Wedding gallery". Tick a database,
a storage bucket, or both. Click **Connect** to get ready-to-paste environment
variables:

```
DATABASE_URL=postgresql://p_wedding_gallery:…@192.168.1.20:5432/p_wedding_gallery
HOME_STORAGE_URL=http://192.168.1.20:9100
HOME_STORAGE_PROJECT=wedding-gallery
HOME_STORAGE_KEY=hs_…
```

**Database:** a normal PostgreSQL database (16 or newer; 18 on Ubuntu 26.04). Any driver or ORM works
(`pg`, Prisma, Drizzle, psycopg, …). Each project has its own login and can't
see the other projects' databases or the outreach database.

**Storage:** copy `homeserver/clients/home-storage.mjs` into the other repo
(no dependencies, Node 18+):

```js
import { homeStorage } from "./home-storage.mjs";
const storage = homeStorage({
  url: process.env.HOME_STORAGE_URL,
  project: process.env.HOME_STORAGE_PROJECT,
  key: process.env.HOME_STORAGE_KEY,   // server-side only
});

await storage.put("photos/ana.jpg", buffer, "image/jpeg");
const file = await storage.get("photos/ana.jpg");               // fetch Response
const { objects } = await storage.list("photos/");
const viewUrl = await storage.signedUrl("photos/ana.jpg");      // 1 h link for <img src> / sharing
const uploadUrl = await storage.signedUrl("uploads/x.jpg", { method: "PUT" }); // browser uploads straight to the server
await storage.del("photos/ana.jpg");
```

Or plain HTTP from any language:

| Request | Does |
|---|---|
| `PUT /v1/<project>/<path>` + `Authorization: Bearer <key>` | upload (body = the file), up to `STORAGE_MAX_UPLOAD_MB` (5 GB) |
| `GET` / `HEAD /v1/<project>/<path>` | download; `Range` supported, so video seeking works |
| `DELETE /v1/<project>/<path>` | delete |
| `GET /v1/<project>?prefix=photos/` | list (JSON) |
| `…?exp=<unix>&sig=<hmac>` | signed URL: one method on one file until it expires, no key needed |

Tick **public** on a project to let anyone read its files by URL (e.g. images
for a website). Uploads and listing still need the key. HTML/SVG files are
served with `Content-Security-Policy: sandbox`, so an uploaded page can't run scripts.

**Where the other app runs matters.**
- **On the server, your LAN, or Tailscale:** the database and storage URLs
  above work directly (the database needs `--db-network`).
- **On Vercel or elsewhere on the internet:** the storage API can be published
  with Cloudflare Tunnel (below; point a hostname at `http://localhost:9100` and
  set `STORAGE_PUBLIC_URL`). Its key and signed URLs protect it. Don't publish
  the database. Apps hosted in the cloud should keep a cloud database (Neon,
  Supabase), or run on the server too.

**Backups:** the nightly job dumps every project database next to the outreach
one (`project-<id>-<date>.sql.gz`). **Restore** in the panel puts a backup back
into the database it came from. Bucket files are plain files under
`/srv/fc-outreach/storage/projects/<id>/`. Copy that folder to a second disk
or cloud drive if losing them would hurt, for example:
`rsync -a /srv/fc-outreach/storage/ /mnt/usb-backup/fc-storage/` from a daily cron.

**Deleting a project** asks you to type its id. It takes a final database
backup, drops the database and login, and moves the bucket to
`storage/trash/`. Nothing is gone until you empty that folder.

## What the control panel does

| Page | What you can do |
|---|---|
| **Projects** | Create a database and/or bucket per repo. Copy the connection details. Make a bucket public or private, rotate its key, reset the database password, delete |
| **Overview** | See host CPU, memory and disk, and whether the app is up. Start, stop or restart each service. Buttons: check inbox now, run the daily job, find leads, back up the database, **Update from GitHub** (git pull, npm ci, rebuild, restart) |
| **Services & logs** | Status, memory and restart count for each service. Live `journalctl` logs |
| **Database** | Outreach database: size, row count per table, AI job queue. Backups of every database: create, download, **restore** (a safety backup is taken first), delete. Neon import |
| **Storage** | Browse shared files or any project's bucket. Upload (including drag and drop), download, create folders, delete |
| **Settings** | Edit `/etc/fc-outreach/outreach.env`. Secrets are never shown: leave a field blank to keep its value, or type to replace it |

The panel runs as your user. The only root access it has is to run
`systemctl start|stop|restart` on its own services (`/etc/sudoers.d/fc-outreach`).
To create project databases it uses `fc_admin`, a Postgres role that can create
roles and databases but is not a superuser, and can only log in from the server itself.

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
`sudo ufw allow from 192.168.0.0/16 to any port 4517,8090,9100,5432 proto tcp`

## Command line equivalents

```bash
systemctl status fc-outreach-app fc-outreach-worker fc-panel postgresql
journalctl -u fc-outreach-app -f
homeserver/scripts/backup.sh                     # back up every database now
homeserver/scripts/backup.sh project <id>        # just one project
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
