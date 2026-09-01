// Runtime config for the hosted outreach tool. All values come from Vercel
// environment variables (Settings -> Environment Variables). No secrets in code.

const e = process.env;

function req(name) {
  const v = e[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export const config = {
  // --- access (HTTP Basic auth, enforced in middleware.js) ---
  opsUser: e.OPS_USER || "fc",
  opsPass: e.OPS_PASS || "",

  // --- cron auth (Vercel sends "Authorization: Bearer $CRON_SECRET") ---
  cronSecret: e.CRON_SECRET || "",

  // --- iCloud mail ---
  smtp: {
    host: "smtp.mail.me.com",
    port: 587,
    secure: false,
    get user() { return req("ICLOUD_SMTP_USER"); },
    get pass() { return req("ICLOUD_SMTP_PASS"); },
  },
  imap: {
    host: "imap.mail.me.com",
    port: 993,
    secure: true,
    get user() { return req("ICLOUD_SMTP_USER"); },
    get pass() { return req("ICLOUD_SMTP_PASS"); },
  },
  from: {
    address: e.ICLOUD_FROM_ADDRESS || "hello@fccleaningcompany.com",
    name: e.ICLOUD_FROM_NAME || "FC Cleaning Company",
  },
  replyTo: e.REPLY_TO || "fernando.c@fccleaningcompany.com",
  digestTo: e.DIGEST_TO || e.ICLOUD_SMTP_USER || "",

  // --- follow-up behaviour ---
  followUpIntervalDays: Number(e.FOLLOWUP_INTERVAL_DAYS || 5),
  maxFollowUps: Number(e.MAX_FOLLOWUPS || 2),

  // --- compliance footer / identity ---
  postalAddress: e.POSTAL_ADDRESS || "57 St Davids Crescent, Aspull, Wigan WN2 1SZ",
  phone: e.PHONE || "07473 379928",
  website: e.WEBSITE || "fccleaningcompany.com",
  senderFirstName: e.SENDER_FIRST_NAME || "Fernando",

  blobKey: "outreach/prospects.json",
};
