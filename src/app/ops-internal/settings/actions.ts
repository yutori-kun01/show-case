"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOpsSession } from "@/lib/auth";
import { CONFIG_FIELDS, getConfig, saveConfig, type ConfigKey } from "@/lib/config";
import { db } from "@/lib/db";
import { github } from "@/lib/github";
import { mail } from "@/lib/mail";
import { opsUrl } from "@/lib/opsPath";

const SECTIONS: Record<string, ConfigKey[]> = {
  site: ["site_name", "site_url"],
  mail: ["resend_api_key", "mail_from"],
  github: ["github_token"],
  limits: ["viewer_session_days", "download_url_ttl_seconds", "download_rate_limit_per_hour"],
};

const NUMBER_KEYS: ConfigKey[] = ["viewer_session_days", "download_url_ttl_seconds", "download_rate_limit_per_hour"];

function back(params: Record<string, string>): never {
  redirect(opsUrl(`/settings?${new URLSearchParams(params).toString()}`));
}

function validate(key: ConfigKey, value: string): string | null {
  if (!value) return null;
  if (key === "site_url" && !/^https?:\/\/[^\s]+$/.test(value)) return "公開側のURLは https:// から始めてください";
  if (key === "mail_from" && !/@[^\s@]+\.[^\s@>]+/.test(value)) return "差出人はメールアドレスを含めてください";
  if (key === "resend_api_key" && !value.startsWith("re_")) return "Resend のAPIキーは re_ から始まります";
  if (NUMBER_KEYS.includes(key) && !/^[1-9]\d*$/.test(value)) return "数値は1以上の整数で入力してください";
  return null;
}

/**
 * セクションごとに保存する。秘密の値は、空欄なら今の値のまま（消すときは「消す」にチェック）。
 * それ以外は、空欄にすると画面の設定を消して、環境変数か既定値に戻る。
 */
export async function saveSettingsAction(form: FormData): Promise<void> {
  const { creator } = await requireOpsSession();
  const section = String(form.get("section") ?? "");
  const keys = SECTIONS[section];
  if (!keys) back({ error: "保存する項目が見つかりません" });

  const patch: Partial<Record<ConfigKey, string>> = {};
  for (const key of keys) {
    const raw = String(form.get(key) ?? "").trim();
    if (CONFIG_FIELDS[key].secret) {
      if (form.get(`clear_${key}`) === "1") patch[key] = "";
      else if (raw) patch[key] = raw;
    } else {
      patch[key] = raw;
    }
    const problem = validate(key, patch[key] ?? "");
    if (problem) back({ error: problem, section });
  }
  await saveConfig(creator, patch);

  // 出品者の表示名と GitHub のユーザー名は creators の行に持つ。
  if (section === "site" && form.has("display_name")) {
    const displayName = String(form.get("display_name") ?? "").trim();
    if (displayName) await db().update("creators", creator.id, { display_name: displayName });
  }
  if (section === "github" && form.has("github_login")) {
    const login = String(form.get("github_login") ?? "").trim();
    await db().update("creators", creator.id, { github_login: login || null });
  }

  revalidatePath("/ops-internal/settings");
  back({ saved: section });
}

/** 今の設定で、ログイン中の運営者のアドレスにテストメールを送る。 */
export async function testMailAction(): Promise<void> {
  const { email, creator } = await requireOpsSession();
  const config = await getConfig(creator);
  try {
    await (await mail()).send({
      to: email,
      subject: `【${config.siteName}】テストメール`,
      text: "セットアップ画面から送ったテストメールです。確認コードもこの差出人から届きます。",
    });
  } catch (error) {
    back({ section: "mail", error: `送信に失敗しました: ${(error as Error).message}`.slice(0, 300) });
  }
  back({
    section: "mail",
    tested: config.mailDriver === "resend" ? `${email} に送りました。受信箱を確認してください` : "Resend が未設定のため、コンソールと .data/mail.log に出力しました",
  });
}

/** 今の設定で GitHub のリポジトリ一覧を取れるか確かめる。 */
export async function testGithubAction(): Promise<void> {
  const { creator } = await requireOpsSession();
  const config = await getConfig(creator);
  let message: string;
  try {
    const repos = await (await github()).listRepos({
      login: creator.github_login ?? undefined,
      installationId: creator.github_installation_id ?? undefined,
    });
    const privateCount = repos.filter((repo) => repo.visibility === "private").length;
    message =
      config.githubDriver === "github"
        ? `つながりました。リポジトリ ${repos.length} 件（うちプライベート ${privateCount} 件）`
        : `トークンが未設定のため、サンプル（fixtures/repos）の ${repos.length} 件を読みました`;
  } catch (error) {
    back({ section: "github", error: `接続に失敗しました: ${(error as Error).message}`.slice(0, 300) });
  }
  back({ section: "github", tested: message });
}
