import { db } from "@/lib/db";
import type { Creator } from "@/lib/db/types";
import { env } from "@/lib/env";
import { siteCreator } from "@/lib/services/creator";
import { open, seal } from "./secretBox";

/**
 * 運営側の「セットアップ」画面から変えられる設定。
 * 画面で保存した値（DB）を優先し、なければ環境変数、それもなければ既定値を使う。
 * DB の接続先や署名の鍵のように、DB を読む前に必要なものはここに含めず環境変数だけで持つ。
 */
export const CONFIG_FIELDS = {
  site_name: { env: "SITE_NAME", secret: false, fallback: "リポジトリショーケース" },
  site_url: { env: "SITE_URL", secret: false, fallback: "" },
  resend_api_key: { env: "RESEND_API_KEY", secret: true, fallback: "" },
  mail_from: { env: "MAIL_FROM", secret: false, fallback: "" },
  github_token: { env: "GITHUB_TOKEN", secret: true, fallback: "" },
  viewer_session_days: { env: "VIEWER_SESSION_DAYS", secret: false, fallback: "30" },
  download_url_ttl_seconds: { env: "DOWNLOAD_URL_TTL_SECONDS", secret: false, fallback: "600" },
  download_rate_limit_per_hour: { env: "DOWNLOAD_RATE_LIMIT_PER_HOUR", secret: false, fallback: "5" },
} as const;

export type ConfigKey = keyof typeof CONFIG_FIELDS;
export type ConfigSource = "screen" | "env" | "default";

export interface ResolvedField {
  value: string;
  source: ConfigSource;
  /** 画面で保存した秘密の値が復号できなかった（OPS_SESSION_SECRET を変えたなど）。 */
  unreadable?: boolean;
}

export interface AppConfig {
  fields: Record<ConfigKey, ResolvedField>;
  siteName: string;
  siteUrl: string | undefined;
  resendApiKey: string | undefined;
  mailFrom: string | undefined;
  githubToken: string | undefined;
  viewerSessionDays: number;
  downloadUrlTtlSeconds: number;
  downloadRateLimitPerHour: number;
  mailDriver: "local" | "resend";
  githubDriver: "local" | "github";
}

async function storedValues(creator: Creator): Promise<Record<string, string>> {
  try {
    const row = await db().findOne("app_config", { creator_id: creator.id });
    return row?.entries ?? {};
  } catch (error) {
    // マイグレーション 0003 を適用する前でも、環境変数の設定だけで動くようにする。
    console.error("[config] 画面の設定を読めませんでした", error);
    return {};
  }
}

function positive(value: string, fallback: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number(fallback);
}

export async function getConfig(creator?: Creator): Promise<AppConfig> {
  const stored = await storedValues(creator ?? (await siteCreator()));
  const fields = {} as Record<ConfigKey, ResolvedField>;
  for (const [key, spec] of Object.entries(CONFIG_FIELDS) as [ConfigKey, (typeof CONFIG_FIELDS)[ConfigKey]][]) {
    const saved = stored[key];
    if (saved) {
      const value = spec.secret ? open(saved) : saved;
      if (value !== null) {
        fields[key] = { value, source: "screen" };
        continue;
      }
      const fromEnv = env.optional(spec.env);
      fields[key] = { value: fromEnv ?? spec.fallback, source: fromEnv ? "env" : "default", unreadable: true };
      continue;
    }
    const fromEnv = env.optional(spec.env);
    fields[key] = fromEnv ? { value: fromEnv, source: "env" } : { value: spec.fallback, source: "default" };
  }

  const value = (key: ConfigKey) => fields[key].value || undefined;
  const resendApiKey = value("resend_api_key");
  const mailFrom = value("mail_from");
  const githubToken = value("github_token");
  return {
    fields,
    siteName: fields.site_name.value || CONFIG_FIELDS.site_name.fallback,
    siteUrl: value("site_url")?.replace(/\/+$/, ""),
    resendApiKey,
    mailFrom,
    githubToken,
    viewerSessionDays: positive(fields.viewer_session_days.value, CONFIG_FIELDS.viewer_session_days.fallback),
    downloadUrlTtlSeconds: positive(fields.download_url_ttl_seconds.value, CONFIG_FIELDS.download_url_ttl_seconds.fallback),
    downloadRateLimitPerHour: positive(
      fields.download_rate_limit_per_hour.value,
      CONFIG_FIELDS.download_rate_limit_per_hour.fallback,
    ),
    mailDriver: resendApiKey ? "resend" : "local",
    githubDriver: githubToken || env.optional("GITHUB_APP_ID") ? "github" : "local",
  };
}

/**
 * 画面からの保存。undefined の項目は変えない。空文字は「画面の設定を消す」（環境変数か既定値に戻る）。
 * 秘密の値は暗号化して保存する。
 */
export async function saveConfig(creator: Creator, patch: Partial<Record<ConfigKey, string>>): Promise<void> {
  const existing = await db().findOne("app_config", { creator_id: creator.id });
  const entries: Record<string, string> = { ...(existing?.entries ?? {}) };
  for (const [key, raw] of Object.entries(patch) as [ConfigKey, string | undefined][]) {
    if (raw === undefined || !(key in CONFIG_FIELDS)) continue;
    const trimmed = raw.trim();
    if (!trimmed) {
      delete entries[key];
      continue;
    }
    entries[key] = CONFIG_FIELDS[key].secret ? seal(trimmed) : trimmed;
  }
  const now = new Date().toISOString();
  if (existing) {
    await db().update("app_config", existing.id, { entries, updated_at: now });
  } else {
    await db().insert("app_config", { creator_id: creator.id, entries, updated_at: now });
  }
}

/** 秘密の値を画面に出すときの伏せ字。末尾4文字だけ見せる。 */
export function maskSecret(value: string): string {
  if (!value) return "";
  return value.length <= 8 ? "••••" : `••••${value.slice(-4)}`;
}
