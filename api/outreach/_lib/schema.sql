-- FC Outreach — Postgres schema (Neon project "fc-outreach" / jolly-rain-50949331)
-- Applied via the Neon MCP / console to both the `main` and `dev` branches.
-- Idempotent: IF NOT EXISTS everywhere. See PLAN-mailshake.md for the design.

-- ─────────────────────────────── prospects ───────────────────────────────
create table if not exists prospects (
  id                text primary key,               -- slug of business name
  business          text not null,
  email             text not null unique,
  contact_name      text,
  source            text,
  address           text,
  location          text,
  phone             text,
  website           text,
  preferred_channel text,
  hook              text,
  tags              text[] not null default '{}',
  notes             text not null default '',
  status            text not null default 'draft',   -- draft|replied|bounced|won|lost|unsubscribed
  followups_sent    int not null default 0,
  research          jsonb,                            -- AI enrichment (see _lib/ai.js)
  research_at       timestamptz,
  -- last inbound signals, mirrored here for the dashboard (also logged in events)
  last_reply_at         timestamptz,
  reply_snippet         text,
  reply_message_id      text,
  auto_ack_at           timestamptz,
  auto_ack_snippet      text,
  auto_ack_message_id   text,
  bounce_reason         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists suppression (
  email      text primary key,
  reason     text not null,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────── campaigns ───────────────────────────────
create table if not exists campaigns (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  status        text not null default 'draft',       -- draft|active|paused|archived
  paused_reason text,
  daily_cap     int  not null default 25,
  ab_min_sends  int  not null default 8,              -- min sends/variant before a winner is locked
  send_days     int[] not null default '{1,2,3,4,5}', -- ISO dow, Mon=1
  window_start  time not null default '08:00',
  window_end    time not null default '16:00',
  timezone      text not null default 'Europe/London',
  from_name     text,
  from_address  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists campaign_steps (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  step_index    int  not null,                        -- 0-based
  kind          text not null default 'email',        -- 'email' | 'task'
  mode          text not null default 'template',     -- 'template' | 'ai'
  wait_days     int  not null default 0,              -- days after previous step (step 0 = after enrol)
  subject_tmpl  text,
  body_tmpl     text,
  ai_guidance   text,                                 -- brief for mode='ai'
  ab_enabled    boolean not null default false,
  subject_tmpl_b text,                                -- variant B (when ab_enabled)
  body_tmpl_b    text,
  task_note     text,                                 -- for kind='task'
  active        boolean not null default true,
  unique (campaign_id, step_index)
);

create table if not exists enrollments (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references campaigns(id) on delete cascade,
  prospect_id    text not null references prospects(id) on delete cascade,
  status         text not null default 'active',      -- active|completed|paused|stopped
  current_step   int  not null default 0,
  next_due_at    timestamptz,
  stopped_reason text,                                -- replied|bounced|unsubscribed|manual
  enrolled_at    timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (campaign_id, prospect_id)
);
create index if not exists enrollments_due_idx on enrollments (status, next_due_at);

-- ─────────────────────────────── sends ───────────────────────────────
create table if not exists sends (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid references enrollments(id) on delete set null,
  prospect_id   text not null references prospects(id) on delete cascade,
  campaign_id   uuid references campaigns(id) on delete set null,
  step_id       uuid references campaign_steps(id) on delete set null,
  step_index    int,
  variant_key   text,                                 -- 'A' | 'B' | null
  ai_generated  boolean not null default false,
  subject       text not null,
  body          text not null,
  status        text not null default 'queued',       -- queued|approved|sent|failed|skipped
  message_id    text,
  in_reply_to   text,
  thread_refs   text,
  queued_for    date not null default (now() at time zone 'Europe/London')::date,
  queued_at     timestamptz not null default now(),
  approved_at   timestamptz,
  sent_at       timestamptz,
  error         text
);
create index if not exists sends_status_day_idx on sends (status, queued_for);
create index if not exists sends_prospect_idx on sends (prospect_id, sent_at desc);

-- ─────────────────────────────── events ───────────────────────────────
-- One row per inbound/outbound signal. Analytics + reply-inbox feed.
create table if not exists events (
  id            uuid primary key default gen_random_uuid(),
  prospect_id   text references prospects(id) on delete cascade,
  campaign_id   uuid references campaigns(id) on delete set null,
  enrollment_id uuid references enrollments(id) on delete set null,
  type          text not null,                        -- sent|reply|auto_ack|bounce|unsubscribe|call
  intent        text,                                 -- reply classification (interested|not_now|...)
  at            timestamptz not null default now(),
  subject       text,
  snippet       text,
  message_id    text,
  handled       boolean not null default false,
  meta          jsonb not null default '{}'           -- {confidence, suggested_reply, variant_key, ...}
);
create index if not exists events_type_at_idx on events (type, at desc);
create index if not exists events_prospect_at_idx on events (prospect_id, at desc);
create index if not exists events_inbox_idx on events (type, handled, at desc);

-- ─────────────────────────────── templates ───────────────────────────────
create table if not exists templates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  subject_tmpl text not null default '',
  body_tmpl    text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ─────────────────────────────── meta ───────────────────────────────
create table if not exists meta (k text primary key, v jsonb not null);
