import { env } from "@/lib/env";
import type { MailAdapter, MailMessage } from "./adapter";

const ENDPOINT = "https://api.resend.com/emails";

/**
 * Resend の HTTP API で送る。差出人のドメインは Resend で認証しておく必要がある
 * （onboarding@resend.dev からは自分のアドレスにしか送れない）。
 */
export class ResendMail implements MailAdapter {
  private readonly apiKey: string;
  private readonly from: string;

  constructor(private readonly fetcher: typeof fetch = fetch) {
    this.apiKey = env.required("RESEND_API_KEY");
    this.from = env.required("MAIL_FROM");
  }

  async send(message: MailMessage): Promise<void> {
    const response = await this.fetcher(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text }),
    });
    if (!response.ok) {
      // 本文にAPIキーは含まれないが、宛先は出さずに状態と理由だけを残す。
      const detail = await response.text().catch(() => "");
      throw new Error(`Resend への送信に失敗しました（${response.status}）: ${detail.slice(0, 300)}`);
    }
  }
}
