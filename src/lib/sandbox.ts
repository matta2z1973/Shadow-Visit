// Gate for sandbox-only affordances — currently the no-code sign-in on
// /login.
//
// This bypasses authentication, so the question that matters is not "is it
// convenient" but "what happens if this code reaches production". Three
// independent conditions must ALL hold, and production satisfies none of
// them:
//
//   1. NEXT_PUBLIC_APP_ENV === "sandbox"   — unset in production
//   2. SANDBOX_QUICK_LOGIN === "1"         — a secret that exists only on
//                                            the sandbox Vercel project
//   3. the Supabase URL points at the sandbox project ref
//
// (3) is the one that can't be satisfied by a stray environment variable:
// even if someone set the first two on the production project, the URL
// would still name the production database and the gate stays shut. The
// checks are server-only — NEXT_PUBLIC_APP_ENV is readable by the browser,
// but the other two are not, and the decision is never made client-side.

// The sandbox Supabase project (shadow-visit, us-west-2). Hardcoded on
// purpose: an allowlist that is itself configurable isn't an allowlist.
const SANDBOX_PROJECT_REF = "lqzjktqpbwrcpgxdovpy";

export function isSandbox(): boolean {
  return process.env.NEXT_PUBLIC_APP_ENV === "sandbox";
}

export function quickLoginEnabled(): boolean {
  if (!isSandbox()) return false;
  if (process.env.SANDBOX_QUICK_LOGIN !== "1") return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!url.includes(SANDBOX_PROJECT_REF)) return false;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  return true;
}

// Who may be signed in as. Defaults to the two standing admins from
// bootstrap.sql; SANDBOX_QUICK_LOGIN_EMAILS can widen it for testing the
// student side. Comparison is lowercased so casing can't slip past it.
export function quickLoginAllowlist(): string[] {
  const raw = process.env.SANDBOX_QUICK_LOGIN_EMAILS;
  const list = raw
    ? raw.split(",").map((e) => e.trim()).filter(Boolean)
    : ["abbondanziom@greenhill.org", "riversf@greenhill.org"];
  return list.map((e) => e.toLowerCase());
}

export function isQuickLoginAllowed(email: string): boolean {
  return quickLoginEnabled() && quickLoginAllowlist().includes(email.trim().toLowerCase());
}
