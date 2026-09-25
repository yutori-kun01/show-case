import { env } from "@/lib/env";
import type { MailAdapter } from "./adapter";
import { LocalMail } from "./local";
import { SmtpMail } from "./smtp";

let cached: MailAdapter | null = null;

/** SMTP_HOST があれば SMTP、なければローカル代替を選ぶ。 */
export function mail(): MailAdapter {
  if (!cached) cached = env.mailDriver === "smtp" ? new SmtpMail() : new LocalMail();
  return cached;
}

export function setMail(adapter: MailAdapter | null): void {
  cached = adapter;
}

export type { MailAdapter, MailMessage } from "./adapter";
