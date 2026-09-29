import crypto from "node:crypto";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "rs_session";
export const VIEWER_COOKIE = "rs_viewer";
const MAX_AGE_SECONDS = 60 * 60 * 8;

/** 運営側と閲覧者のセッションを取り違えないよう、署名に用途を含める。 */
type Purpose = "ops" | "viewer";

export interface SessionPayload {
  email: string;
  expiresAt: number;
}

function createToken(purpose: Purpose, email: string, maxAgeSeconds: number, now: number): string {
  const payload: SessionPayload = {
    email: email.toLowerCase(),
    expiresAt: Math.floor(now / 1000) + maxAgeSeconds,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signature(purpose, body)}`;
}

function readToken(purpose: Purpose, token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, provided] = token.split(".");
  if (!body || !provided) return null;
  const expected = signature(purpose, body);
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (payload.expiresAt * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** HMACで署名した運営側のセッション値を作る。 */
export function createSessionToken(email: string, now = Date.now()): string {
  return createToken("ops", email, MAX_AGE_SECONDS, now);
}

export function readSessionToken(token: string | undefined): SessionPayload | null {
  return readToken("ops", token);
}

export const SESSION_MAX_AGE = MAX_AGE_SECONDS;

/** 閲覧者のセッション値。期間はセットアップ画面の「ログインの有効期間」（既定30日）。 */
export function createViewerToken(email: string, maxAgeSeconds = 30 * 24 * 60 * 60, now = Date.now()): string {
  return createToken("viewer", email, maxAgeSeconds, now);
}

export function readViewerToken(token: string | undefined): SessionPayload | null {
  return readToken("viewer", token);
}

function signature(purpose: Purpose, body: string): string {
  return crypto.createHmac("sha256", env.sessionSecret).update(`${purpose}.${body}`).digest("base64url");
}
