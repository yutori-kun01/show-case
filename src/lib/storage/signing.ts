import crypto from "node:crypto";
import { env } from "@/lib/env";

/** ローカル配信用の署名。R2 を使う場合は S3 の署名付きURLに置き換わる。 */
export function sign(key: string, expiresAt: number): string {
  return crypto
    .createHmac("sha256", env.signingSecret)
    .update(`${key}:${expiresAt}`)
    .digest("base64url");
}

export function verify(key: string, expiresAt: number, signature: string): boolean {
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return false;
  const expected = sign(key, expiresAt);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
