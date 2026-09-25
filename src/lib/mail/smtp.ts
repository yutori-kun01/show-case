import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";
import type { MailAdapter, MailMessage } from "./adapter";

/**
 * SMTPで送る。Gmail（アプリパスワード）なら独自ドメインなしで無料で使える。
 * Resend などの SMTP も同じ設定で使える。
 */
export class SmtpMail implements MailAdapter {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor() {
    const port = Number(env.optional("SMTP_PORT") ?? 465);
    this.transporter = nodemailer.createTransport({
      host: env.required("SMTP_HOST"),
      port,
      secure: port === 465,
      auth: { user: env.required("SMTP_USER"), pass: env.required("SMTP_PASS") },
    });
    this.from = env.optional("MAIL_FROM") ?? env.required("SMTP_USER");
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}
