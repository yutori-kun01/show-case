import crypto from "node:crypto";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "rs_session";
const MAX_AGE_SECONDS = 60 * 60 * 8;

export interface SessionPayload {
  email: string;
  expiresAt: number;
}

/** HMACで署名したセッション値を作る。 */
export function createSessionToken(email: string, now = Date.now()): string {
  const payload: SessionPayload = {
    email: email.toLowerCase(),
    expiresAt: Math.floor(now / 1000) + MAX_AGE_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signature(body)}`;
}

export function readSessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, provided] = token.split(".");
  if (!body || !provided) return null;
  const expected = signature(body);
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

export const SESSION_MAX_AGE = MAX_AGE_SECONDS;

function signature(body: string): string {
  return crypto.createHmac("sha256", env.sessionSecret).update(body).digest("base64url");
}
