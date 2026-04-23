import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";
import { env } from "@/lib/env";

const globalForDb = globalThis as typeof globalThis & {
  __supoPool?: Pool;
};

export const pool =
  globalForDb.__supoPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__supoPool = pool;
}

export const db = drizzle(pool, { schema });
