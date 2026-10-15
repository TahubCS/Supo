import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";
import { env } from "@/lib/env";

const globalForDb = globalThis as typeof globalThis & {
  __supoPool?: Pool;
};

function sslConfig(connectionString: string) {
  if (env.DATABASE_SSL === "disable" || /sslmode=disable/i.test(connectionString)) {
    return false;
  }
  return { rejectUnauthorized: true };
}

function createPool() {
  const connectionString = env.DATABASE_URL;
  return new Pool({ connectionString, ssl: sslConfig(connectionString) });
}

export const pool = globalForDb.__supoPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__supoPool = pool;
}

export const db = drizzle(pool, { schema });
