import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

// Reuse one pool across hot reloads in dev.
const globalForDb = globalThis as unknown as { db?: Database };

function createDb(): Database {
  const client = postgres(env().DATABASE_URL, { max: 10 });
  return drizzle(client, { schema });
}

export function getDb(): Database {
  globalForDb.db ??= createDb();
  return globalForDb.db;
}

export { schema };
