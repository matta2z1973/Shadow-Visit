"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { ilike } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";

const requestSchema = z.object({
  email: z.string().email(),
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
});

export type LoginState =
  | { phase: "idle" }
  | { phase: "needs_signup"; email: string; message: string }
  | { phase: "code_sent"; email: string; message: string }
  | { phase: "error"; message: string };

const initial: LoginState = { phase: "idle" };

export async function requestOtp(
  _prev: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const parsed = requestSchema.safeParse({
    email: formData.get("email"),
    firstName: formData.get("firstName") || undefined,
    lastName: formData.get("lastName") || undefined,
  });
  if (!parsed.success) {
    return { phase: "error", message: "Please enter a valid email address." };
  }
  const fullName =
    [parsed.data.firstName, parsed.data.lastName]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join(" ") || undefined;

  // Sign-in mode (no name given) must not silently create an account for an
  // email nobody has registered — send people through "Create account" first
  // instead, where they set their name.
  if (!fullName) {
    let existing: { id: string } | undefined;
    try {
      [existing] = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(ilike(profiles.email, parsed.data.email))
        .limit(1);
    } catch (err) {
      // Must not let a DB failure here become an unhandled rejection — that
      // crashes the whole serverless process (confirmed in production logs:
      // exit status 128), taking down every other concurrent request on
      // that instance, not just this one. Fail this single request instead.
      console.error("requestOtp: profile existence check failed", err);
      return {
        phase: "error",
        message:
          "Something went wrong checking your account. Please try again in a moment.",
      };
    }
    if (!existing) {
      return {
        phase: "needs_signup",
        email: parsed.data.email,
        message:
          "We don't have an account for that email yet. Enter your name below to create one.",
      };
    }
  }

  const supabase = await createSupabaseServerClient();
  const headerList = await headers();
  const origin =
    process.env.APP_URL ?? `https://${headerList.get("host") ?? "localhost"}`;

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      // Magic link still works for inboxes that don't pre-fetch (e.g. Gmail).
      // The email template includes both a {{ .Token }} 6-digit code and the
      // {{ .ConfirmationURL }} link; users pick whichever method works.
      emailRedirectTo: `${origin}/auth/callback`,
      data: fullName
        ? {
            full_name: fullName,
            first_name: parsed.data.firstName ?? null,
            last_name: parsed.data.lastName ?? null,
          }
        : undefined,
    },
  });

  if (error) {
    return { phase: "error", message: error.message };
  }

  return {
    phase: "code_sent",
    email: parsed.data.email,
    message: `Code sent to ${parsed.data.email}.`,
  };
}

const verifySchema = z.object({
  email: z.string().email(),
  // Supabase OTP length is configurable (4-10). Allow whatever length the
  // project is set to.
  code: z
    .string()
    .trim()
    .regex(/^\d{4,10}$/, "Enter the numeric code from your email"),
});

export async function verifyOtp(
  _prev: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const parsed = verifySchema.safeParse({
    email: formData.get("email"),
    code: formData.get("code"),
  });
  if (!parsed.success) {
    const email = (formData.get("email") as string) || "";
    return {
      phase: "code_sent",
      email,
      message: parsed.error.issues[0]?.message ?? "Invalid code.",
    };
  }

  const supabase = await createSupabaseServerClient();
  // signInWithOtp generates a magiclink-type token (Supabase default for the
  // email channel). Don't use type: "email" here — that's for a different
  // PKCE-based confirmation flow and produces "Token has expired or is
  // invalid" against this token.
  const { error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.code,
    type: "magiclink",
  });

  if (error) {
    return {
      phase: "code_sent",
      email: parsed.data.email,
      message: error.message,
    };
  }

  redirect("/");
}
