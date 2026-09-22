import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";

export interface LoginEvent {
  at: string;
  email: string;
  ip: string;
  userAgent: string;
  result: "success" | "failure" | "locked" | "not_allowed";
}

/** ログイン履歴を残す。運営側の入口が試されていないかを後から確認するため。 */
export async function recordLogin(event: Omit<LoginEvent, "at">): Promise<void> {
  const line = JSON.stringify({ at: new Date().toISOString(), ...event });
  if (env.isProduction) {
    // 本番では標準出力に出し、ホスティング側のログに集約する。
    console.info(`[ops-login] ${line}`);
    return;
  }
  const file = path.join(env.dataDir, "ops-login.log");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, `${line}\n`, "utf8");
}
