// Temporary diagnostic instrumentation for the Supabase connection-hang
// investigation (2026-08-31). Logs when a labeled async step starts,
// completes, or fails, with elapsed time, so Vercel logs show exactly which
// step in a request never finished instead of just "the page timed out".
// Safe to rip out once the root cause is confirmed fixed.
export function newRequestId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function timed<T>(reqId: string, label: string, promise: Promise<T>): Promise<T> {
  const start = Date.now();
  console.log(`[debug ${reqId}] ${label}: started`);
  return promise.then(
    (result) => {
      console.log(`[debug ${reqId}] ${label}: completed in ${Date.now() - start}ms`);
      return result;
    },
    (err) => {
      console.log(
        `[debug ${reqId}] ${label}: FAILED after ${Date.now() - start}ms - ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    },
  );
}
