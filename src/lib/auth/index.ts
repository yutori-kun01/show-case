import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import type { Creator } from "@/lib/db/types";
import { SESSION_COOKIE, createSessionToken, readSessionToken, SESSION_MAX_AGE } from "./session";
import { clearFailures, isLocked, registerFailure } from "./rateLimit";
import { recordLogin } from "./loginLog";

export { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken, readSessionToken };

/** 許可リストにあるメールアドレスかどうか。 */
export function isAllowedEmail(email: string): boolean {
  return env.opsAllowedEmails.includes(email.trim().toLowerCase());
}

export interface SignInResult {
  ok: boolean;
  token?: string;
  message?: string;
}

/**
 * 運営側のログイン。Supabase Auth が設定されていればそれを使い、
 * なければローカル開発用のパスワードで確認する。どちらでも許可リストは必ず見る。
 */
export async function signIn(email: string, password: string, context: { ip: string; userAgent: string }): Promise<SignInResult> {
  const normalized = email.trim().toLowerCase();
  const key = `${context.ip}:${normalized}`;

  if (isLocked(key)) {
    await recordLogin({ email: normalized, ...context, result: "locked" });
    return { ok: false, message: "試行回数が多すぎます。しばらく待ってからお試しください" };
  }

  if (!isAllowedEmail(normalized)) {
    registerFailure(key);
    await recordLogin({ email: normalized, ...context, result: "not_allowed" });
    return { ok: false, message: "メールアドレスかパスワードが違います" };
  }

  const verified = await verifyPassword(normalized, password);
  if (!verified) {
    registerFailure(key);
    await recordLogin({ email: normalized, ...context, result: "failure" });
    return { ok: false, message: "メールアドレスかパスワードが違います" };
  }

  clearFailures(key);
  await recordLogin({ email: normalized, ...context, result: "success" });
  return { ok: true, token: createSessionToken(normalized) };
}

async function verifyPassword(email: string, password: string): Promise<boolean> {
  if (password.length === 0) return false;
  if (env.dbDriver === "supabase" && env.optional("SUPABASE_ANON_KEY")) {
    const client = createClient(env.required("SUPABASE_URL"), env.required("SUPABASE_ANON_KEY"), {
      auth: { persistSession: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    // 二要素認証を有効にしている場合、ここで aal2 まで上げる必要がある。
    if (error || !data.session) return false;
    const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") return false;
    return true;
  }
  const devPassword = env.optional("OPS_DEV_PASSWORD");
  return Boolean(devPassword) && password === devPassword;
}

/** 運営側の現在のログイン。未認証なら404（入口の存在を知らせない）。 */
export async function requireOpsSession(): Promise<{ email: string; creator: Creator }> {
  const store = await cookies();
  const session = readSessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session || !isAllowedEmail(session.email)) notFound();
  return { email: session.email, creator: await currentCreator() };
}

/** フェーズ1は出品者1人。なければ作る。 */
export async function currentCreator(): Promise<Creator> {
  const existing = (await db().select("creators"))[0];
  if (existing) return existing;
  return db().insert("creators", {
    display_name: env.optional("CREATOR_DISPLAY_NAME") ?? "運営",
    github_login: env.optional("CREATOR_GITHUB_LOGIN") ?? null,
    github_installation_id: env.optional("GITHUB_INSTALLATION_ID") ?? null,
  });
}

export async function requestContext(): Promise<{ ip: string; userAgent: string }> {
  const header = await headers();
  return {
    ip: header.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
    userAgent: header.get("user-agent") ?? "unknown",
  };
}
