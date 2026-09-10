// Neon Postgres client. One HTTP-backed connection per invocation — fine for
// the serverless functions here. DATABASE_URL is set in Vercel (Production →
// Neon `main` branch, Preview → Neon `dev` branch).

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("Missing env var DATABASE_URL");
}

// Tagged-template query helper: sql`select * from x where id = ${id}`
export const sql = neon(process.env.DATABASE_URL);
