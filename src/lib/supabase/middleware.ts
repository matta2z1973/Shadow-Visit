import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  try {
    // Runs on every single request before any page code. Unbounded, this
    // can stall the whole request on a slow/unresponsive Auth API call
    // before the page ever gets a chance to run (and its own, now-bounded,
    // error handling never gets invoked). Give up and let the request
    // proceed unauthenticated rather than hang — downstream code already
    // treats a missing/invalid session as signed-out.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("auth.getUser() timed out")), 10_000),
    );
    await Promise.race([supabase.auth.getUser(), timeout]);
  } catch (err) {
    console.error("updateSupabaseSession: auth.getUser() failed", err);
  }

  return response;
}
