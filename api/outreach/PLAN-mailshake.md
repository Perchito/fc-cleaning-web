# Outreach → "Mailshake-lite" — implementation plan

Status: **planning only, not started.** Written 2026-09-10.

Decisions locked in with Luis:
- **Send model:** *approve the day's batch* — the app queues what's due, Luis
  reviews and hits one button to send. No unattended auto-send.
- **Storage:** move off the single Vercel Blob JSON file to **Neon Postgres**.
- **Scope:** Phase 1 first (sequences + queue + approved send). Phase 2 (UI
  overhaul) and Phase 3 (A/B, multi-identity, calendar) later.

---

## 1. Why change anything

Today (`api/outreach/`, `public/ops/`):
- One JSON blob (`outreach/prospects.json`) is the whole database. Every write
  rewrites the file; the reply-poll cron and the dashboard can clobber each
  other's writes.
- Sending is fully manual: open a card → edit the auto-draft → send.
- Templates are hardcoded in `_lib/templates.js` (initial + 2 follow-up rounds).
- No concept of a campaign/sequence, no scheduling, no per-step or per-campaign
  numbers, no CSV import.

Mailshake's core is: **define a cadence once, enrol prospects, it runs.** That's
Phase 1 here. The rest (nice UI, analytics, A/B) is polish on top.

---

## 2. Constraints that shape the design

| Constraint | Consequence |
|---|---|
| **Vercel Hobby crons run once/day per path** (see `README.md`) | No frequent "sender" cron. Sending is **user-triggered** on approval; only two daily crons: build-the-queue and poll-replies. |
| **iCloud SMTP ≈ 500 msgs/day, rate-limits bursts, account risk if abused** | Hard per-campaign daily cap (default 25). Jitter 45–120 s between sends. Never >1 email per prospect per 48 h across all campaigns. |
| **Serverless 60 s budget** (`vercel.json` `maxDuration: 60`) | `sender` sends in batches of ~8–10 per invocation; the review screen calls it in a loop with a progress bar. |
| **Neon free plan** (`org-winter-credit-43879900`, 0.5 GB, autosuspend) | Fine. First query after idle ~500 ms cold start. One project already exists (`refund-tracker`); create a **separate project `fc-outreach`** if the free plan allows >1, else a separate **database** in the existing project. |
| **Shared working tree** — other Claude sessions auto-commit & deploy `main` to prod | Do Phase 1 as one focused effort on a branch + PR, not incremental pushes to `main`. Keep the blob file intact as rollback. |
| **Deliverability** | Plain text only (unchanged). No open-tracking pixels / click-wrapping — not worth the spam-score and PECR cost at this volume. Reply rate is the KPI. |

---

## 3. Data model (Neon Postgres)

`api/outreach/_lib/schema.sql` — new.

```sql
-- prospects: the people. Global/terminal state lives here; campaign state
-- lives in enrollments.
create table prospects (
  id            text primary key,              -- slug of business name
  business      text not null,
  email         text not null unique,
  contact_name  text,
  source        text,
  address       text,
  location      text,
  phone         text,
  website       text,
  preferred_channel text,                       -- 'email' | 'phone' | null
  hook          text,
  tags          text[] not null default '{}',
  notes         text not null default '',
  status        text not null default 'draft',  -- draft|replied|bounced|won|lost|unsubscribed
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- suppression: never email these again (unsubscribes, hard bounces, manual).
create table suppression (
  email      text primary key,
  reason     text not null,
  created_at timestamptz not null default now()
);

create table campaigns (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  status        text not null default 'draft',  -- draft|active|paused|archived
  daily_cap     int  not null default 25,
  send_days     int[] not null default '{1,2,3,4,5}',   -- ISO dow, Mon=1
  window_start  time not null default '08:00',
  window_end    time not null default '16:00',
  timezone      text not null default 'Europe/London',
  from_name     text,                           -- null => config default
  from_address  text,                           -- null => config default
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table campaign_steps (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  step_index    int  not null,                  -- 0-based
  kind          text not null default 'email',  -- 'email' | 'task'
  wait_days     int  not null default 0,        -- days after previous step (step 0 = after enrol)
  subject_tmpl  text,
  body_tmpl     text,
  task_note     text,                           -- for kind='task' (e.g. "call them")
  active        boolean not null default true,
  unique (campaign_id, step_index)
);

create table enrollments (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  prospect_id   text not null references prospects(id) on delete cascade,
  status        text not null default 'active', -- active|completed|paused|stopped
  current_step  int  not null default 0,
  next_due_at   timestamptz,                    -- when the current step should queue
  stopped_reason text,                          -- replied|bounced|unsubscribed|manual
  enrolled_at   timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (campaign_id, prospect_id)
);

create table sends (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid references enrollments(id) on delete set null,
  prospect_id   text not null references prospects(id) on delete cascade,
  campaign_id   uuid references campaigns(id) on delete set null,
  step_id       uuid references campaign_steps(id) on delete set null,
  step_index    int,
  subject       text not null,
  body          text not null,
  status        text not null default 'queued', -- queued|approved|sent|failed|skipped
  message_id    text,                           -- Message-ID of the sent mail
  in_reply_to   text,                           -- threading: previous send's message_id
  thread_refs   text,                           -- full References header value
  queued_for    date not null,                  -- the batch day
  queued_at     timestamptz not null default now(),
  approved_at   timestamptz,
  sent_at       timestamptz,
  error         text
);
create index on sends (status, queued_for);

-- events: the analytics + reply-inbox feed. One row per inbound/outbound signal.
create table events (
  id            uuid primary key default gen_random_uuid(),
  prospect_id   text references prospects(id) on delete cascade,
  campaign_id   uuid references campaigns(id) on delete set null,
  enrollment_id uuid references enrollments(id) on delete set null,
  type          text not null,                  -- sent|reply|auto_ack|bounce|unsubscribe|call
  at            timestamptz not null default now(),
  subject       text,
  snippet       text,
  message_id    text,
  handled       boolean not null default false, -- for the reply inbox
  meta          jsonb not null default '{}'
);
create index on events (type, at desc);
create index on events (prospect_id, at desc);

-- meta: single-row-ish key/value (last_poll_at etc.)
create table meta (k text primary key, v jsonb not null);
```

Notes:
- `prospects.id` stays a slug so existing threading / message-ids and the
  discover cron keep working with minimal change.
- Phone calls: keep the existing `call.js` behaviour, just write a `events`
  row (`type='call'`) instead of a `calls[]` array entry. A `kind='task'`
  step is the "cadence tells you to call them" case — it creates a to-do,
  doesn't send anything, and only advances when Luis marks it done.

---

## 4. Merge fields

`api/outreach/_lib/render.js` — new.

Supported tokens: `{{firstName}}`, `{{contactName}}`, `{{business}}`,
`{{hook}}`, `{{location}}`, `{{senderFirstName}}`, `{{senderTitle}}`,
`{{phone}}`, `{{website}}`.

- Fallback syntax: `{{firstName|there}}` → "there" when first name is unknown.
- `{{hook}}` falls back to the `HOOKS` map (move it from `templates.js` into
  `render.js` or a `hooks` table) then to `commercial cleaning for {{business}}`.
- Pre-send validation: a step whose rendered body still contains `{{…}}`
  with no fallback is flagged in the review screen and cannot be approved.

Seed the default campaign's 3 steps from the current `templates.js` copy so
nothing is lost.

---

## 5. Endpoints

Under `api/outreach/`. Keep the Basic-auth middleware; add `DATABASE_URL`.

**New**
| File | Method | Purpose |
|---|---|---|
| `_lib/db.js` | — | Neon serverless client + tiny query helpers |
| `_lib/schema.sql` | — | migration |
| `_lib/render.js` | — | merge-field rendering + validation |
| `_lib/suppression.js` | — | `isSuppressed(email)`, `suppress(email, reason)` |
| `campaigns.js` | GET/POST/PATCH | list / create / update (status, caps, window). Steps embedded in body. |
| `enroll.js` | POST/DELETE | `{campaignId, prospectIds[]}` → create/stop enrollments |
| `queue.js` | GET | today's `queued`+`approved` sends, grouped by campaign, with rendered preview + validation flags |
| `queue.js` | POST | `{action:'approve'\|'skip'\|'snooze'\|'edit', ids[], patch?}` |
| `sender.js` | POST | send a bounded batch of `approved` sends (user-triggered from review screen); returns `{sent, failed, remaining}` |
| `cron-queue.js` | GET (cron auth) | daily: turn due enrollments into `queued` sends for today, respecting `daily_cap` |
| `import.js` | POST | CSV upload → dedupe (against prospects + suppression) → create prospects → optional enrol |
| `stats.js` | GET | per-campaign: enrolled / sent / replied / bounced / reply-rate / by-step |
| `events.js` | GET/POST | reply inbox: list `type in (reply,auto_ack,bounce)`, mark handled |

**Changed**
| File | Change |
|---|---|
| `prospects.js` | read/write Postgres instead of blob; keep the decorate/sort shape the current UI expects |
| `status.js`, `call.js` | Postgres; `call.js` writes an `events` row |
| `poll.js`, `cron.js`, `_lib/imap.js` | on reply/bounce/unsub: also set `enrollments.status='stopped'` + reason, write `events`, and for "unsubscribe" keyword → `suppression` + stop *all* the prospect's enrollments |
| `_lib/digest.js` | pull "follow-ups due" from enrollments; add "N waiting for your approval" line |
| `draft.js`, `send.js` | keep as the **one-off manual email** path (outside any campaign) — still handy |
| `_lib/store.js` | delete (logic moves to `_lib/db.js` + per-domain helpers) |
| `_lib/seed.js` | delete after migration (or keep only for reference) |
| `vercel.json` | add `{ "path": "/api/outreach/cron-queue", "schedule": "0 6 * * *" }` |

---

## 6. The "approve the day's batch" flow

1. **Enrol** — in the UI, pick prospects (or import a CSV, or a saved filter),
   "Add to campaign X". Creates `enrollments` (step 0, `next_due_at = now`).
2. **`cron-queue` (06:00 UK daily)** — for every `active` enrollment with
   `next_due_at <= now` and prospect not terminal / not suppressed:
   - `kind='task'` step → write an `events` to-do, leave enrollment for the
     manual "mark done" action.
   - `kind='email'` step → render subject/body, create a `sends` row
     `status='queued', queued_for=today`, with `in_reply_to` / `thread_refs`
     from the prospect's previous send for threading.
   - Stop queueing a campaign once its `daily_cap` is hit; the rest roll to
     tomorrow (their `next_due_at` is left, they re-qualify next run).
3. **Review screen ("Today — N to approve")** — grouped by campaign, each item
   shows the rendered email, editable inline. Buttons: *Approve all* ·
   *Approve* · *Edit* · *Skip* (marks `skipped`, advances enrolment) ·
   *Snooze 1 day*. Approving → `status='approved'`.
4. **Send** — Luis clicks *Send approved*. Frontend calls `sender.js` in a
   loop (batch ≈ 8, server sleeps 45–120 s between each within a batch,
   client shows progress) until `remaining = 0`. Each send:
   - SMTP send (plain text, campaign's from-identity or config default),
   - `sends.status='sent'` + `message_id`,
   - `events` row `type='sent'`,
   - advance enrolment: `current_step++`; if a next active step exists →
     `next_due_at = now + next.wait_days` (clamped into the send window),
     else `status='completed'`.
5. **Replies** — existing IMAP poll, extended: reply → `enrollments.status
   ='stopped'` reason `replied`, `prospects.status='replied'`, `events`
   `type='reply'`; bounce → `stopped`/`bounced` + `suppression`; body
   contains "unsubscribe" → `suppression` + stop all their enrollments.

No frequent cron needed — sending happens in the approval request.

---

## 7. Migration (blob → Postgres)

1. Create Neon project `fc-outreach` (or DB in `refund-tracker` if free plan
   caps projects at 1). Note the pooled connection string.
2. Apply `_lib/schema.sql` (via Neon MCP `run_sql` or a one-off script).
3. `scripts/migrate-blob-to-pg.mjs` — read the current
   `outreach/prospects.json` blob and insert:
   - every prospect → `prospects`,
   - each `sends[]` entry → a `sends` row `status='sent'` + `events` `type='sent'`,
   - `lastReplyAt` / `replySnippet` → `events` `type='reply'`,
   - `autoAckAt` → `events` `type='auto_ack'`,
   - `bounceReason` → `events` `type='bounce'` + `suppression`,
   - `calls[]` → `events` `type='call'`,
   - one `campaigns` row "Legacy (2026-08)" with the 3 current template steps,
     and a `completed` enrollment per already-contacted prospect so history
     and stats read correctly.
4. Add `DATABASE_URL` to Vercel (Production + Preview; point Preview at a Neon
   dev branch).
5. Deploy the branch as a Vercel **preview**, smoke-test `/ops` against it,
   then merge. Keep `outreach/prospects.json` untouched as rollback.
6. Follow-up commit: delete `_lib/store.js`, `_lib/seed.js`, drop
   `@vercel/blob` from the outreach code.

---

## 8. Deliverability guardrails (build them in, not optional)

- Per-campaign `daily_cap`, default 25.
- Send window Mon–Fri 08:00–16:00 Europe/London; skip weekends. (UK bank
  holidays: nice-to-have, Phase 3.)
- Jitter 45–120 s between individual sends.
- Global rule: never email a prospect twice inside 48 h, across all campaigns.
- Plain text only.
- Honour the existing one-line unsubscribe footer via the `suppression` table —
  checked before every queue and every send.
- Safety valve: if a campaign's last 20 sends bounce > 10 %, auto-pause it and
  put a line in the digest.

---

## 9. Phase 2 (later) — UI overhaul

Rebuild `public/ops/` around tabs: **Queue · Campaigns · Prospects · Replies ·
Stats**.
- Prospects: searchable/filterable/sortable table, multi-select → enrol, CSV
  import button, bulk tag.
- Campaigns: step editor (drag to reorder, wait-days, live merge-field
  preview against a sample prospect), pause/activate, per-step numbers inline.
- Replies: the `events` inbox — snippet, open-in-mail link, mark handled,
  quick "won/lost/unsubscribe".
- Stats: enrolled / sent / reply-rate per campaign, funnel by step.
- Stay vanilla JS, or adopt Preact + htm via CDN (no build step). Open choice.

## 10. Phase 3 (later)

A/B subject lines per step · multiple send identities (Fernando / hello@) ·
saved reply snippets · sending calendar view · UK bank-holiday skip ·
optional open tracking (only if a real need appears).

---

## 11. Suggested build order (Phase 1)

1. **Storage cut-over, no behaviour change** — ✅ DONE (branch `outreach-sequences`,
   not yet merged). `_lib/db.js`, `_lib/schema.sql`, `_lib/prospects.js`
   (replaces `store.js`), `migrate.js` (one-off). Ported prospects / status /
   call / send / draft / poll / imap / cron / digest / discover. Verified on a
   Vercel preview: the `/prospects` API is byte-identical to prod across all 26
   prospects; all read+write endpoints and the IMAP poll work against Neon.
   **Cutover still to do:** merge → deploy → run `migrate.js?confirm=reset` on
   prod → verify → delete `migrate.js` + drop `@vercel/blob`.
2. Campaign + step + enrollment CRUD (`campaigns.js`, `enroll.js`) +
   `render.js` merge fields + seed the "Legacy" campaign.
3. `cron-queue.js` + `queue.js` (review) + `sender.js` + enrolment
   advancement + extend the IMAP poll to stop enrollments.
4. Minimal Queue UI bolted onto the current dashboard: a top banner
   "Today — N to approve" → review list → *Send approved* with progress.
5. `import.js` (CSV) + a basic import box in the UI.
6. `stats.js` + a small stats strip.

Rough effort: steps 1–4 ≈ one to two focused sessions; 5–6 ≈ half a session.
Phase 2 ≈ one to two more sessions.

---

## 12. Open questions for Luis

- **Neon:** OK to create a second Neon project `fc-outreach`, or keep it in the
  existing `refund-tracker` project as its own database?
- **From-identity per campaign:** need more than `fernando.c@` (e.g. some
  campaigns from `hello@`), or one identity is fine for now?
- **Default cadence:** keep the current 3 touches (email → +5 d → +5 d), or
  change the intervals / add a phone-call task step?
- **CSV shape:** what columns will your lead lists actually have? (business,
  email, contact, website, area…)
- **Branch/PR or straight to main?** Given other sessions auto-deploy `main`,
  I'd do Phase 1 on a branch behind a Vercel preview and merge once green.
