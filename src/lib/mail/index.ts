import { env } from "@/lib/env";
import type { MailAdapter } from "./adapter";
import { LocalMail } from "./local";
import { ResendMail } from "./resend";

let cached: MailAdapter | null = null;

/** RESEND_API_KEY があれば Resend、なければローカル代替を選ぶ。 */
export function mail(): MailAdapter {
  if (!cached) cached = env.mailDriver === "resend" ? new ResendMail() : new LocalMail();
  return cached;
}

export function setMail(adapter: MailAdapter | null): void {
  cached = adapter;
}

export type { MailAdapter, MailMessage } from "./adapter";
