export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Safety net for the 2026-08 Supabase us-west-2 incident: several DB
  // calls across the app aren't individually wrapped in try/catch (two
  // confirmed ones already are, in src/lib/auth.ts and
  // src/app/login/actions.ts), and a stalled/cancelled query occasionally
  // surfaces as a raw unhandled rejection from postgres-js's socket
  // handling rather than a normal awaited-promise rejection our own
  // try/catch blocks would see. Left unhandled, Node kills the whole
  // serverless process — which cuts off whatever else that process was
  // mid-way through streaming, producing the "header loaded, rest of the
  // page permanently blank" symptom, not just a failure for the one
  // request that actually hit the DB error. Log and continue instead of
  // crashing; the one request that triggered it still fails/times out
  // normally, but it no longer takes every other concurrent request on
  // that instance down with it.
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection (contained, not crashing process):", reason);
  });
}
