import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Supabase's shared pooler caps clients (pool_size 15). Keep each process's
// pool small and release idle connections so dev + scripts don't collide.
const client = postgres(connectionString, {
  prepare: false,
  max: 4,
  idle_timeout: 20,
});

export const db = drizzle(client, { schema });
export { schema };
