"use server";

import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isQuickLoginAllowed, quickLoginEnabled } from "@/lib/sandbox";

export type QuickLoginState = { ok: boolean; message: string };

// Signs in as an allowlisted sandbox account without the emailed code.
//
// It does NOT forge a session: it asks Supabase's admin API for a real
// magic-link token for the account and immediately redeems it server-side,
// so what lands in the cookie jar is an ordinary session produced by the
// normal auth flow. That matters — a hand-rolled session would drift from
// how real sign-in behaves and this sandbox exists to mirror production.
export async function sandboxQuickLogin(
  _prev: QuickLoginState | undefined,
  formData: FormData,
): Promise<QuickLoginState> {
  // Re-checked here rather than trusted from the caller: a server action is
  // a public HTTP endpoint, so the UI not rendering a button is not a
  // control. In production every one of these conditions is false.
  if (!quickLoginEnabled()) {
    return { ok: false, message: "Not available." };
  }

  const email = String(formData.get("email") ?? "").trim();
  if (!isQuickLoginAllowed(email)) {
    console.warn(`sandboxQuickLogin: refused non-allowlisted email ${JSON.stringify(email)}`);
    return { ok: false, message: "That account isn't on the sandbox allowlist." };
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let hashedToken: string | undefined;
  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (error) return { ok: false, message: `Couldn't mint a session: ${error.message}` };
    hashedToken = data.properties?.hashed_token;
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Couldn't reach the auth API.",
    };
  }
  if (!hashedToken) {
    return { ok: false, message: "Auth API returned no token — does that account exist here?" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: hashedToken,
    type: "magiclink",
  });
  if (error) return { ok: false, message: `Sign-in failed: ${error.message}` };

  // "/" routes admins to /admin and students to /me, so this lands each
  // account wherever its real role belongs.
  redirect("/");
}
