"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser, VIEW_AS_COOKIE } from "@/lib/auth";

export async function viewAsStudent() {
  const user = await getCurrentUser();
  if (!user || user.actualRole !== "admin") redirect("/");

  const store = await cookies();
  store.set(VIEW_AS_COOKIE, "student", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  redirect("/me");
}

export async function viewAsAdmin() {
  const store = await cookies();
  store.delete(VIEW_AS_COOKIE);
  redirect("/admin");
}
