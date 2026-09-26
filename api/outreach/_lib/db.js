// Postgres client. Two drivers behind one interface:
//   - Neon (default): one HTTP-backed connection per invocation — fine for the
//     serverless functions on Vercel. DATABASE_URL is set in Vercel (Production
//     → Neon `main` branch, Preview → Neon `dev` branch).
//   - node-postgres (DB_DRIVER=pg): a normal TCP pool, for the self-hosted
//     home server (homeserver/), which talks to a local Postgres.
// Both expose sql`...` and sql.query(text, params), resolving to an array of rows.

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("Missing env var DATABASE_URL");
}

async function pgClient(url) {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const query = async (text, params = []) => (await pool.query(text, params)).rows;
  const tag = (strings, ...values) => query(strings.reduce((acc, s, i) => acc + "$" + i + s), values);
  tag.query = query;
  return tag;
}

// Tagged-template query helper: sql`select * from x where id = ${id}`
export const sql =
  process.env.DB_DRIVER === "pg" ? await pgClient(process.env.DATABASE_URL) : neon(process.env.DATABASE_URL);
