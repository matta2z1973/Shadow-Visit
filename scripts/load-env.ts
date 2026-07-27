// Side-effect module: load .env.local before anything that reads process.env
// (e.g. src/lib/db). Import this FIRST in CLI scripts.
try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local optional if the environment is already populated
}
