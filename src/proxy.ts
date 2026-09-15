import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    // `/help/*` is deliberately excluded: those pages are public static HTML
    // for people who aren't signed in, so running the session refresh on
    // them would spend a Supabase Auth round trip (and a 10s worst-case
    // stall — see updateSupabaseSession) to produce a cookie nothing reads.
    "/((?!_next/static|_next/image|favicon.ico|help/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
