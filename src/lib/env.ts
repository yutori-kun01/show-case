/**
 * 環境変数の読み取り。運営側のホスト名・パス・秘密鍵は必ずここ経由で参照し、
 * コードにハードコードしない（仕様書「全体構成とURL設計」）。
 */

function optional(key: string): string | undefined {
  const value = process.env[key];
  return value && value.length > 0 ? value : undefined;
}

function required(key: string): string {
  const value = optional(key);
  if (!value) throw new Error(`環境変数 ${key} が設定されていません`);
  return value;
}

function list(key: string): string[] {
  return (optional(key) ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function secret(key: string, devFallback: string): string {
  const value = optional(key);
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error(`本番では環境変数 ${key} を設定してください`);
  return devFallback;
}

/**
 * ここにあるのは、DB を読む前に必要な設定（接続先・鍵・運営側の入口）だけ。
 * サイト名やメール・GitHub のキーなどは、運営側の「セットアップ」画面から変える（src/lib/config）。
 */
export const env = {
  optional,
  required,

  /** local | supabase */
  get dbDriver(): "local" | "supabase" {
    return optional("SUPABASE_URL") && optional("SUPABASE_SERVICE_ROLE_KEY") ? "supabase" : "local";
  },
  /** local | r2 | supabase。R2 を設定していればそれを、Supabase につないでいれば Supabase Storage を使う。 */
  get storageDriver(): "local" | "r2" | "supabase" {
    if (optional("R2_BUCKET") && optional("R2_ACCESS_KEY_ID")) return "r2";
    if (this.dbDriver === "supabase") return "supabase";
    return "local";
  },
  /** Supabase Storage のバケット名。なければ初回の保存で非公開バケットとして作る。 */
  get supabaseStorageBucket(): string {
    return optional("SUPABASE_STORAGE_BUCKET") ?? "showcase";
  },

  /** 運営側の秘匿パス。先頭スラッシュ付きに正規化する。 */
  get opsBasePath(): string {
    const raw = optional("OPS_BASE_PATH") ?? "ops";
    const trimmed = raw.replace(/^\/+|\/+$/g, "");
    return `/${trimmed}`;
  },
  /** true なら運営側の入口を閉じる（公開側だけをデプロイし、運営は手元のPCで行う構成）。 */
  get opsDisabled(): boolean {
    return optional("OPS_DISABLED") === "1" || optional("OPS_DISABLED") === "true";
  },
  /** 運営側を独立ホストで運用する場合のホスト名（任意）。 */
  get opsHost(): string | undefined {
    return optional("OPS_HOST")?.toLowerCase();
  },
  /** 運営側にログインできるメールアドレスの許可リスト。 */
  get opsAllowedEmails(): string[] {
    return list("OPS_ALLOWED_EMAILS");
  },
  /** 本番で未設定のままだとセッションを偽造できてしまうため、開発用の値は本番では使わない。 */
  get sessionSecret(): string {
    return secret("OPS_SESSION_SECRET", "dev-only-insecure-session-secret");
  },
  get signingSecret(): string {
    return secret("DOWNLOAD_SIGNING_SECRET", "dev-only-insecure-signing-secret");
  },
  get dataDir(): string {
    return optional("LOCAL_DATA_DIR") ?? ".data";
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },
};
