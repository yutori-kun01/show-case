export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** メール送信のアダプタ。Resend とローカル代替が実装する。 */
export interface MailAdapter {
  send(message: MailMessage): Promise<void>;
}
