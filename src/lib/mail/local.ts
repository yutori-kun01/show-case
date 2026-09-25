import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import type { MailAdapter, MailMessage } from "./adapter";

/** 送信せず、コンソールと .data/mail.log に書き出すローカル代替。 */
export class LocalMail implements MailAdapter {
  readonly sent: MailMessage[] = [];

  constructor(private readonly file: string | null = path.join(env.dataDir, "mail.log")) {}

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    const line = JSON.stringify({ at: new Date().toISOString(), ...message });
    console.info(`[mail] ${line}`);
    if (!this.file) return;
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.appendFile(this.file, `${line}\n`, "utf8");
  }
}
