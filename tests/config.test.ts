import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, setDb } from "@/lib/db";
import { LocalDb } from "@/lib/db/local";
import { getConfig, maskSecret, saveConfig } from "@/lib/config";
import { siteCreator } from "@/lib/services/creator";
import { mail } from "@/lib/mail";
import { ResendMail } from "@/lib/mail/resend";
import { LocalMail } from "@/lib/mail/local";

let workDir: string;
const ENV_KEYS = ["SITE_NAME", "RESEND_API_KEY", "MAIL_FROM", "OPS_SESSION_SECRET", "DOWNLOAD_RATE_LIMIT_PER_HOUR"];

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "showcase-config-"));
  setDb(new LocalDb(path.join(workDir, "db.json")));
});

afterEach(async () => {
  setDb(null);
  for (const key of ENV_KEYS) delete process.env[key];
  await fs.rm(workDir, { recursive: true, force: true });
});

describe("設定の読み込み", () => {
  it("何も設定しなければ既定値", async () => {
    const config = await getConfig();
    expect(config.siteName).toBe("リポジトリショーケース");
    expect(config.fields.site_name.source).toBe("default");
    expect(config.downloadRateLimitPerHour).toBe(5);
    expect(config.mailDriver).toBe("local");
  });

  it("環境変数があればそれを使い、画面で保存した値がさらに優先される", async () => {
    process.env.SITE_NAME = "環境変数の名前";
    expect((await getConfig()).fields.site_name).toEqual({ value: "環境変数の名前", source: "env" });

    await saveConfig(await siteCreator(), { site_name: "画面の名前" });
    expect((await getConfig()).fields.site_name).toEqual({ value: "画面の名前", source: "screen" });

    // 空で保存すると、画面の設定を消して環境変数に戻る。
    await saveConfig(await siteCreator(), { site_name: "" });
    expect((await getConfig()).siteName).toBe("環境変数の名前");
  });

  it("保存しない項目は変えない", async () => {
    const creator = await siteCreator();
    await saveConfig(creator, { site_name: "名前", mail_from: "a <a@example.com>" });
    await saveConfig(creator, { site_name: "新しい名前" });
    expect((await getConfig()).mailFrom).toBe("a <a@example.com>");
  });
});

describe("秘密の値", () => {
  it("暗号化して保存し、読むときに戻す", async () => {
    await saveConfig(await siteCreator(), { resend_api_key: "re_secret_value_1234" });
    const [row] = await db().select("app_config");
    expect(JSON.stringify(row)).not.toContain("re_secret_value_1234");
    const config = await getConfig();
    expect(config.resendApiKey).toBe("re_secret_value_1234");
    expect(config.mailDriver).toBe("resend");
  });

  it("鍵（OPS_SESSION_SECRET）が変わると読めず、入れ直しを促す", async () => {
    await saveConfig(await siteCreator(), { resend_api_key: "re_secret_value_1234" });
    process.env.OPS_SESSION_SECRET = "another-secret";
    const field = (await getConfig()).fields.resend_api_key;
    expect(field.unreadable).toBe(true);
    expect(field.value).toBe("");
  });

  it("伏せ字は末尾4文字だけ見せる", () => {
    expect(maskSecret("re_secret_value_1234")).toBe("••••1234");
    expect(maskSecret("short")).toBe("••••");
  });
});

describe("設定に応じた送信手段", () => {
  it("画面で Resend のキーを入れると Resend で送る", async () => {
    expect(await mail()).toBeInstanceOf(LocalMail);
    await saveConfig(await siteCreator(), { resend_api_key: "re_key_abcdefgh", mail_from: "a <a@example.com>" });
    expect(await mail()).toBeInstanceOf(ResendMail);
  });

  it("数値の設定が不正なら既定値を使う", async () => {
    process.env.DOWNLOAD_RATE_LIMIT_PER_HOUR = "abc";
    expect((await getConfig()).downloadRateLimitPerHour).toBe(5);
  });
});
