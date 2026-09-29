import { getConfig } from "@/lib/config";
import type { MailAdapter } from "./adapter";
import { LocalMail } from "./local";
import { ResendMail } from "./resend";

let override: MailAdapter | null = null;

/** セットアップ画面（なければ環境変数）に Resend のキーがあれば Resend、なければローカル代替を選ぶ。 */
export async function mail(): Promise<MailAdapter> {
  if (override) return override;
  const config = await getConfig();
  if (config.resendApiKey) return new ResendMail({ apiKey: config.resendApiKey, from: config.mailFrom ?? "" });
  return new LocalMail();
}

/** テスト用に差し替える。 */
export function setMail(adapter: MailAdapter | null): void {
  override = adapter;
}

export type { MailAdapter, MailMessage } from "./adapter";
