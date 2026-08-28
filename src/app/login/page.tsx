"use client";

import { Suspense, useActionState, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { requestOtp, verifyOtp, type LoginState } from "./actions";

const initial: LoginState = { phase: "idle" };

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [reqState, reqAction, sending] = useActionState(requestOtp, initial);
  const [verState, verAction, verifying] = useActionState(verifyOtp, initial);

  // /auth/callback redirects here with ?error=... when the emailed link's
  // code exchange fails (e.g. an email scanner like Outlook Safe Links
  // "pre-clicked" the link and used up its single-use code before the real
  // click happened, or the link was opened in a different browser than the
  // one that requested it, so the PKCE verifier cookie isn't there). The
  // numeric code fallback below doesn't have either problem, so surface this
  // clearly and point people at it.
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");

  // Local override so user can hit "Use a different email" without losing the
  // server state we already have.
  const [restartKey, setRestartKey] = useState(0);

  // Splash defaults to email-only sign in; "Create account" reveals name fields.
  const [mode, setMode] = useState<"signin" | "create">("signin");

  // Trying to sign in with an email that has no account routes here
  // automatically. Using an effect (rather than deriving `creating` directly
  // from reqState) keeps the manual "Sign in"/"Create account" toggle
  // working afterward instead of getting stuck on "create".
  useEffect(() => {
    if (reqState.phase === "needs_signup") setMode("create");
  }, [reqState]);

  // Post-submit we show "check your email"; the code entry is a fallback only.
  const [showCode, setShowCode] = useState(false);

  // After a request succeeds we show the verify form. If verification fails,
  // verState.phase will be "code_sent" again with an error message; either way
  // we want to render the verify form once we're past the initial step.
  const codePhase =
    reqState.phase === "code_sent" || verState.phase === "code_sent";
  const email =
    reqState.phase === "code_sent"
      ? reqState.email
      : verState.phase === "code_sent"
        ? verState.email
        : "";
  const verifyMessage =
    verState.phase === "code_sent" || verState.phase === "error"
      ? verState.message
      : null;

  if (codePhase && restartKey % 2 === 0) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-16">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            We sent a sign-in link to <strong>{email}</strong>. Open the email and
            click the link to sign in — you can close this tab.
          </p>
        </div>

        {!showCode ? (
          <div className="flex flex-col gap-3 text-sm">
            <button
              type="button"
              onClick={() => setShowCode(true)}
              className="text-left text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
            >
              Link didn&rsquo;t work? Enter the code instead
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCode(false);
                setRestartKey((k) => k + 1);
              }}
              className="text-left text-xs text-zinc-500 underline-offset-4 hover:underline"
            >
              ← Use a different email
            </button>
          </div>
        ) : (
          <form action={verAction} className="flex flex-col gap-4">
            <input type="hidden" name="email" value={email} />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Sign-in code from the email</span>
              <input
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{4,10}"
                maxLength={10}
                required
                autoFocus
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-center font-mono text-lg tracking-[0.3em] focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
                placeholder="12345678"
              />
            </label>

            <button
              type="submit"
              disabled={verifying}
              className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-white hover:bg-forest/90 disabled:opacity-60 dark:bg-forest dark:text-white"
            >
              {verifying ? "Signing in..." : "Sign in"}
            </button>

            {verifyMessage ? (
              <p className="text-sm text-red-700 dark:text-red-400">{verifyMessage}</p>
            ) : null}

            <button
              type="button"
              onClick={() => {
                setShowCode(false);
                setRestartKey((k) => k + 1);
              }}
              className="text-left text-xs text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
            >
              ← Use a different email
            </button>
          </form>
        )}
      </main>
    );
  }

  const inputCls =
    "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900";
  const creating = mode === "create";
  const prefillEmail =
    reqState.phase === "needs_signup" ? reqState.email : undefined;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {creating ? "Create your account" : "Sign in"}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {creating
            ? "Enter your name and school email. We’ll email you a sign-in code."
            : "Enter your school email and we’ll send you a sign-in code."}
        </p>
      </div>

      {callbackError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          <p className="font-medium">The sign-in link didn&rsquo;t work ({callbackError}).</p>
          <p className="mt-1">
            This usually happens when an email scanner opens the link before
            you do, or the link is opened on a different device/browser than
            the one that requested it. Request a new code below, then use
            &ldquo;Link didn&rsquo;t work? Enter the code instead&rdquo; on the
            next screen — typing the code always works.
          </p>
        </div>
      ) : null}

      <form action={reqAction} className="flex flex-col gap-4">
        {creating ? (
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium">First name</span>
              <input name="firstName" type="text" autoComplete="given-name" required className={inputCls} />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium">Last name</span>
              <input name="lastName" type="text" autoComplete="family-name" className={inputCls} />
            </label>
          </div>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">School email</span>
          <input
            key={prefillEmail ?? "email-input"}
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus={!creating}
            defaultValue={prefillEmail}
            className={inputCls}
          />
        </label>

        <button
          type="submit"
          disabled={sending}
          className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-white hover:bg-forest/90 disabled:opacity-60 dark:bg-forest dark:text-white"
        >
          {sending
            ? "Sending..."
            : creating
              ? "Create account & email code"
              : "Email me a sign-in code"}
        </button>

        {reqState.phase === "needs_signup" ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {reqState.message}
          </p>
        ) : null}

        {reqState.phase === "error" ? (
          <p className="text-sm text-red-700 dark:text-red-400">
            {reqState.message}
          </p>
        ) : null}
      </form>

      <div className="text-center text-sm text-zinc-600 dark:text-zinc-400">
        {creating ? (
          <>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
            >
              Sign in
            </button>
          </>
        ) : (
          <>
            First time here?{" "}
            <button
              type="button"
              onClick={() => setMode("create")}
              className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
            >
              Create account
            </button>
          </>
        )}
      </div>
    </main>
  );
}
