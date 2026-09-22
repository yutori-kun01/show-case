"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_MAX_AGE, requestContext, signIn } from "@/lib/auth";
import { env } from "@/lib/env";
import { opsUrl } from "@/lib/opsPath";

export async function signInAction(_previous: { message?: string }, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const result = await signIn(email, password, await requestContext());
  if (!result.ok || !result.token) {
    return { message: result.message ?? "ログインできませんでした" };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect(opsUrl("/"));
}

export async function signOutAction() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect(opsUrl("/login"));
}
