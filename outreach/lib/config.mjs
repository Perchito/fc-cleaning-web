// Central config. Secrets are NOT copied into this project — the iCloud
// credentials are read at runtime from the icloud-email MCP server's .env
// (single source of truth). This project's own .env holds only non-secret
// operational settings plus the dashboard access token.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, "..");
export const DATA_DIR = join(ROOT, "data");

function parseEnvFile(path) {
  const out = {};
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

// This project's operational settings.
const local = { ...parseEnvFile(join(ROOT, ".env")), ...process.env };

// iCloud credentials, borrowed from the MCP server so there is only one copy.
const mcpEnvPath =
  local.ICLOUD_ENV_PATH ||
  join(homedir(), ".claude", "mcp-servers", "icloud-email", ".env");
const icloud = parseEnvFile(mcpEnvPath);

function need(name, value) {
  if (!value) {
    throw new Error(
      `Missing ${name}. Checked this project's .env and ${mcpEnvPath}.`,
    );
  }
  return value;
}

export const config = {
  port: Number(local.PORT || 4517),
  host: local.HOST || "0.0.0.0",

  // Access token required on every request (query param ?token= once, then cookie).
  token: need("DASHBOARD_TOKEN (in outreach/.env)", local.DASHBOARD_TOKEN),

  // Where the daily digest email goes. Falls back to the SMTP login address.
  digestTo: local.DIGEST_TO || icloud.ICLOUD_SMTP_USER || "",

  // Cron expression for the daily reply poll + digest. Default 08:00 local.
  pollCron: local.POLL_CRON || "0 8 * * *",

  // Defaults applied to new prospects.
  followUpIntervalDays: Number(local.FOLLOWUP_INTERVAL_DAYS || 5),
  maxFollowUps: Number(local.MAX_FOLLOWUPS || 2),

  smtp: {
    host: "smtp.mail.me.com",
    port: 587,
    secure: false,
    user: need(`ICLOUD_SMTP_USER (in ${mcpEnvPath})`, icloud.ICLOUD_SMTP_USER),
    pass: need(`ICLOUD_SMTP_PASS (in ${mcpEnvPath})`, icloud.ICLOUD_SMTP_PASS),
  },
  imap: {
    host: "imap.mail.me.com",
    port: 993,
    secure: true,
    user: need(`ICLOUD_SMTP_USER (in ${mcpEnvPath})`, icloud.ICLOUD_SMTP_USER),
    pass: need(`ICLOUD_SMTP_PASS (in ${mcpEnvPath})`, icloud.ICLOUD_SMTP_PASS),
  },
  from: {
    address: icloud.ICLOUD_FROM_ADDRESS || "hello@fccleaningcompany.com",
    name: icloud.ICLOUD_FROM_NAME || "FC Cleaning Company",
  },
  replyTo: local.REPLY_TO || "fernando.c@fccleaningcompany.com",

  // Footer identity for CAN-SPAM / PECR compliance.
  postalAddress:
    local.POSTAL_ADDRESS || "57 St Davids Crescent, Aspull, Wigan WN2 1SZ",
  phone: local.PHONE || "07473 379928",
  website: local.WEBSITE || "fccleaningcompany.com",
  senderFirstName: local.SENDER_FIRST_NAME || "Fernando",
};
