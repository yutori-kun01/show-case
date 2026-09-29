"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { VIEWER_COOKIE } from "@/lib/auth/session";
import { getConfig } from "@/lib/config";
import { safeNextPath } from "@/lib/auth/viewer";
import { env } from "@/lib/env";
import { AccessError, requestAccess, verifyAccess } from "@/lib/services/access";

export interface AccessFormState {
  step: "email" | "code";
  email: string;
  message?: string;
  devCode?: string;
}

async function signInWith(token: string, next: string): Promise<never> {
  const store = await cookies();
  store.set(VIEWER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/",
    maxAge: (await getConfig()).viewerSessionDays * 24 * 60 * 60,
  });
  redirect(safeNextPath(next));
}

/** メールアドレスの送信（intent=send）と、確認コードの照合（intent=verify）を受け持つ。 */
export async function accessAction(previous: AccessFormState, form: FormData): Promise<AccessFormState> {
  const intent = String(form.get("intent") ?? "send");
  const next = String(form.get("next") ?? "/");
  const email = String(form.get("email") ?? previous.email ?? "");

  if (intent === "restart") return { step: "email", email };

  let token: string;
  try {
    if (intent === "verify") {
      token = await verifyAccess(email, String(form.get("code") ?? ""));
    } else {
      const header = await headers();
      const ip = header.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
      const result = await requestAccess(email, ip);
      if (result.status === "code_sent") {
        return { step: "code", email: result.email, devCode: result.devCode };
      }
      token = result.token;
    }
  } catch (error) {
    if (error instanceof AccessError) {
      return { step: intent === "verify" ? "code" : "email", email, message: error.message };
    }
    console.error("[access]", error);
    return { step: "email", email, message: "送信に失敗しました。時間をおいてお試しください" };
  }
  return signInWith(token, next);
}

export async function viewerSignOutAction(): Promise<void> {
  const store = await cookies();
  store.delete(VIEWER_COOKIE);
  redirect("/access");
}
