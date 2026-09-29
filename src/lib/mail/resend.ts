import type { MailAdapter, MailMessage } from "./adapter";

const ENDPOINT = "https://api.resend.com/emails";

/**
 * Resend の HTTP API で送る。差出人のドメインは Resend で認証しておく必要がある
 * （onboarding@resend.dev からは自分のアドレスにしか送れない）。
 */
export class ResendMail implements MailAdapter {
  private readonly apiKey: string;
  private readonly from: string;

  constructor(options: { apiKey: string; from: string }, private readonly fetcher: typeof fetch = fetch) {
    if (!options.apiKey) throw new Error("Resend のAPIキーが設定されていません");
    if (!options.from) throw new Error("差出人（MAIL_FROM）が設定されていません");
    this.apiKey = options.apiKey;
    this.from = options.from;
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
