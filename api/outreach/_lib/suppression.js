// Do-not-contact list. Checked before every queue build and every send.

import { sql } from "./db.js";

export async function suppress(email, reason) {
  if (!email) return;
  await sql`
    insert into suppression (email, reason) values (${String(email).toLowerCase().trim()}, ${reason})
    on conflict (email) do nothing`;
}

export async function isSuppressed(email) {
  const rows = await sql`select 1 from suppression where email = ${String(email).toLowerCase().trim()}`;
  return rows.length > 0;
}

export async function suppressedSet(emails) {
  if (!emails?.length) return new Set();
  const lc = emails.map((e) => String(e).toLowerCase().trim());
  const rows = await sql`select email from suppression where email = any(${lc})`;
  return new Set(rows.map((r) => r.email));
}

const UNSUB_RE =
  /\b(unsubscribe|opt[\s-]?out|remove me|take me off|stop (?:emailing|contacting|messaging)|do not (?:contact|email)|no longer wish)\b/i;

export function looksLikeUnsubscribe(text) {
  return UNSUB_RE.test(String(text || ""));
}
