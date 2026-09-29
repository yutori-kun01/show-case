import crypto from "node:crypto";
import { env } from "@/lib/env";

/**
 * 画面から入れたAPIキーなどを、DBに保存する前に暗号化する（AES-256-GCM）。
 * 鍵は OPS_SESSION_SECRET から導くので、PC と公開側で同じ値にしておく必要がある。
 * OPS_SESSION_SECRET を変えると復号できなくなり、画面で入れ直すことになる。
 */
const PREFIX = "v1:";

function key(): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", env.sessionSecret, "repo-showcase", "app-config-secrets", 32));
}

export function seal(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** 復号できなければ null（鍵が変わった、値が壊れているなど）。 */
export function open(sealed: string): string | null {
  if (!sealed.startsWith(PREFIX)) return null;
  try {
    const raw = Buffer.from(sealed.slice(PREFIX.length), "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
