"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_BYPASS_COOKIE } from "@/lib/auth";

export type BypassState = { ok: boolean; message: string };

export async function bypassLogin(
  _prev: BypassState | undefined,
  formData: FormData,
): Promise<BypassState> {
  const expected = process.env.ADMIN_BYPASS_TOKEN;
  if (!expected) return { ok: false, message: "Bypass is disabled." };

  const token = (formData.get("token") as string | null)?.trim();
  if (!token || token !== expected) {
    return { ok: false, message: "Incorrect token." };
  }

  const store = await cookies();
  store.set(ADMIN_BYPASS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // localhost is plain http
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24h — re-enter the token again after that
  });

  redirect("/admin");
}
