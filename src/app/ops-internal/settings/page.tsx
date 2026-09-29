import crypto from "node:crypto";
import { requireOpsSession } from "@/lib/auth";
import { CONFIG_FIELDS, getConfig, maskSecret, type ConfigKey, type ResolvedField } from "@/lib/config";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { OpsNav } from "../OpsNav";
import { saveSettingsAction, testGithubAction, testMailAction } from "./actions";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ saved?: string; section?: string; error?: string; tested?: string }>;
}

const SOURCE_LABEL = { screen: "この画面で設定", env: "環境変数", default: "既定値" } as const;

type Check = { key: string; ok: boolean; warn?: boolean; state: string; help: string };

/** DB を読む前に必要なので、環境変数（.env.local やホスティングの設定画面）でしか決められないもの。 */
function envChecklist(): Check[] {
  const has = (key: string) => Boolean(env.optional(key));
  const basePath = env.optional("OPS_BASE_PATH");
  return [
    {
      key: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY",
      ok: env.dbDriver === "supabase",
      warn: env.dbDriver !== "supabase",
      state: env.dbDriver === "supabase" ? "接続中" : "未設定（.data/ に保存中）",
      help: "公開するなら必須。Supabase の Project Settings → API で確認できます。ZIPと画像も同じ Supabase に自動で置きます。",
    },
    {
      key: "OPS_SESSION_SECRET",
      ok: has("OPS_SESSION_SECRET"),
      warn: !has("OPS_SESSION_SECRET"),
      state: has("OPS_SESSION_SECRET") ? "設定済み" : "開発用の値で動作中",
      help: "ログインとこの画面の秘密の値の暗号化に使う鍵。PC と公開側で同じ値にしてください。変えると、この画面の秘密の値は入れ直しになります。",
    },
    {
      key: "DOWNLOAD_SIGNING_SECRET",
      ok: has("DOWNLOAD_SIGNING_SECRET"),
      warn: !has("DOWNLOAD_SIGNING_SECRET"),
      state: has("DOWNLOAD_SIGNING_SECRET") ? "設定済み" : "開発用の値で動作中",
      help: "ダウンロードURLの署名に使う鍵。PC と公開側で同じ値にしてください。",
    },
    {
      key: "OPS_BASE_PATH",
      ok: Boolean(basePath) && !["ops", "k3n9x2"].includes(basePath!),
      warn: !basePath || ["ops", "k3n9x2"].includes(basePath),
      state: basePath ? `/${basePath}` : "未設定（/ops）",
      help: "運営側の入口のパス。推測されにくいランダムな文字列にしてください（例の値のままにしない）。",
    },
    {
      key: "OPS_ALLOWED_EMAILS / OPS_DEV_PASSWORD",
      ok: env.opsAllowedEmails.length > 0,
      state: `${env.opsAllowedEmails.length} 件`,
      help: "運営側にログインできるメールアドレスとパスワード。Supabase Auth を使う場合はパスワードの代わりにそちらで確認します。",
    },
    {
      key: "OPS_DISABLED",
      ok: true,
      state: env.opsDisabled ? "1（運営側を閉じている）" : "未設定（運営側を開いている）",
      help: "公開側のホスティング（Netlify など）では 1 にして、運営は手元のPCで行います。",
    },
  ];
}

function SourceBadge({ field }: { field: ResolvedField }) {
  return (
    <span className={`status ${field.source === "screen" ? "published" : ""}`}>
      {SOURCE_LABEL[field.source]}
    </span>
  );
}

function TextField({
  name,
  label,
  field,
  placeholder,
  type = "text",
}: {
  name: ConfigKey;
  label: string;
  field: ResolvedField;
  placeholder?: string;
  type?: string;
}) {
  const saved = field.source === "screen" ? field.value : "";
  const fallback = field.source === "screen" ? "" : field.value;
  return (
    <>
      <label htmlFor={name}>
        {label} <SourceBadge field={field} />
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={saved}
        placeholder={fallback ? `${fallback}（${SOURCE_LABEL[field.source]}）` : placeholder}
      />
    </>
  );
}

function SecretField({ name, label, field, placeholder }: { name: ConfigKey; label: string; field: ResolvedField; placeholder: string }) {
  return (
    <>
      <label htmlFor={name}>
        {label} <SourceBadge field={field} />
      </label>
      {field.unreadable && (
        <div className="notice error">
          保存した値を復号できませんでした（OPS_SESSION_SECRET を変えた可能性があります）。入れ直してください。
        </div>
      )}
      <input
        id={name}
        name={name}
        type="password"
        autoComplete="off"
        placeholder={field.value ? `${maskSecret(field.value)}（変えるときだけ入力）` : placeholder}
      />
      {field.source === "screen" && (
        <div className="checkbox">
          <input id={`clear_${name}`} type="checkbox" name={`clear_${name}`} value="1" />
          <label htmlFor={`clear_${name}`} style={{ margin: 0, color: "inherit" }}>
            この画面で入れた値を消す
          </label>
        </div>
      )}
    </>
  );
}

function Result({ params, section }: { params: Awaited<Props["searchParams"]>; section: string }) {
  if (params.saved === section) return <div className="notice ok">保存しました</div>;
  if (params.section !== section) return null;
  if (params.error) return <div className="notice error">{params.error}</div>;
  if (params.tested) return <div className="notice ok">{params.tested}</div>;
  return null;
}

export default async function SettingsPage({ searchParams }: Props) {
  const { email, creator } = await requireOpsSession();
  const params = await searchParams;
  const config = await getConfig(creator);
  const f = config.fields;
  const checks = envChecklist();
  const sampleSecret = crypto.randomBytes(32).toString("base64url");

  // 必要なテーブルがあるか（マイグレーションを適用したか）を確かめる。
  let tablesReady = true;
  try {
    await Promise.all([db().count("app_config"), db().count("viewers"), db().count("site_settings")]);
  } catch {
    tablesReady = false;
  }

  const done = [
    env.dbDriver === "supabase" && tablesReady,
    checks.every((check) => !check.warn),
    config.mailDriver === "resend" && Boolean(config.mailFrom),
    config.githubDriver === "github",
    Boolean(config.siteUrl),
  ].filter(Boolean).length;

  return (
    <main className="container">
      <OpsNav current="/settings" />
      <h1>セットアップ</h1>
      <p className="lead">
        メールや GitHub のキーは、この画面から設定できます（暗号化してDBに保存し、公開側にも反映されます）。
        DB の接続先と鍵だけは、先に環境変数で設定します。完了 {done} / 5
      </p>

      {!params.section && params.error && <div className="notice error">{params.error}</div>}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>1. 環境変数で決めるもの</h2>
        <p className="small muted">
          PC では <code>.env.local</code>、公開側ではホスティングの環境変数の画面に書きます。変えたらサーバーを再起動してください。
        </p>
        {!tablesReady && (
          <div className="notice error">
            DB に必要なテーブルがありません。Supabase の SQL Editor で <code>supabase/migrations/</code> のSQLを番号順に実行してください。
          </div>
        )}
        <table>
          <tbody>
            {checks.map((check) => (
              <tr key={check.key}>
                <td style={{ width: "34%" }}>
                  <code>{check.key}</code>
                </td>
                <td style={{ width: "22%" }}>
                  <span className={`status ${check.warn ? "blocked" : "published"}`}>{check.state}</span>
                </td>
                <td className="small muted">{check.help}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <label htmlFor="sample-secret">鍵に使えるランダムな値（開くたびに変わります。コピーして使ってください）</label>
        <input id="sample-secret" type="text" readOnly defaultValue={sampleSecret} />
      </div>

      <form className="panel" action={saveSettingsAction}>
        <input type="hidden" name="section" value="site" />
        <h2 style={{ marginTop: 0 }}>2. サイト</h2>
        <Result params={params} section="site" />
        <TextField name="site_name" label="サイト名（確認コードのメールの件名に入ります）" field={f.site_name} />
        <TextField
          name="site_url"
          label="公開側のURL（メールの本文と、閲覧者画面の「共有するURL」に出ます）"
          field={f.site_url}
          placeholder="https://your-site.netlify.app"
          type="url"
        />
        <label htmlFor="display_name">出品者の表示名</label>
        <input id="display_name" name="display_name" type="text" defaultValue={creator.display_name} />
        <p style={{ marginBottom: 0 }}>
          <button type="submit">保存する</button>
        </p>
      </form>

      <div className="panel">
        <form action={saveSettingsAction}>
          <input type="hidden" name="section" value="mail" />
          <h2 style={{ marginTop: 0 }}>3. メール（Resend）</h2>
          <Result params={params} section="mail" />
          <p className="small muted">
            閲覧者の確認コードを送ります。Resend で差出人のドメインを認証し、「Sending access」権限のAPIキーを作って貼り付けてください。
            未設定のあいだは、コードはコンソールと <code>.data/mail.log</code> に出ます。
          </p>
          <SecretField name="resend_api_key" label="APIキー" field={f.resend_api_key} placeholder="re_..." />
          <TextField
            name="mail_from"
            label="差出人（認証したドメインのアドレス）"
            field={f.mail_from}
            placeholder="講座サポート <no-reply@example.com>"
          />
          <p style={{ marginBottom: 0 }}>
            <button type="submit">保存する</button>
          </p>
        </form>
        <form action={testMailAction} className="row" style={{ marginTop: 12 }}>
          <button type="submit" className="secondary">
            {email} にテストメールを送る
          </button>
        </form>
      </div>

      <div className="panel">
        <form action={saveSettingsAction}>
          <input type="hidden" name="section" value="github" />
          <h2 style={{ marginTop: 0 }}>4. GitHub</h2>
          <Result params={params} section="github" />
          <p className="small muted">
            GitHub の Settings → Developer settings → Fine-grained tokens で、Contents と Metadata を「読み取り」だけにしたトークンを作って貼り付けてください。
            このトークンは運営側でだけ使います。
          </p>
          <SecretField name="github_token" label="個人トークン" field={f.github_token} placeholder="github_pat_..." />
          <label htmlFor="github_login">GitHub のユーザー名（ZIPから消す名前とNGワードに使います。公開側には出ません）</label>
          <input id="github_login" name="github_login" type="text" defaultValue={creator.github_login ?? ""} />
          <p style={{ marginBottom: 0 }}>
            <button type="submit">保存する</button>
          </p>
        </form>
        <form action={testGithubAction} className="row" style={{ marginTop: 12 }}>
          <button type="submit" className="secondary">
            接続を確かめる
          </button>
        </form>
      </div>

      <form className="panel" action={saveSettingsAction}>
        <input type="hidden" name="section" value="limits" />
        <h2 style={{ marginTop: 0 }}>5. ログインとダウンロード</h2>
        <Result params={params} section="limits" />
        <TextField name="viewer_session_days" label="閲覧者のログインの有効期間（日）" field={f.viewer_session_days} />
        <TextField
          name="download_url_ttl_seconds"
          label="ダウンロードURLの有効期限（秒）"
          field={f.download_url_ttl_seconds}
        />
        <TextField
          name="download_rate_limit_per_hour"
          label="同じメールアドレスのダウンロード回数（1時間あたり）"
          field={f.download_rate_limit_per_hour}
        />
        <p className="small muted">空欄にすると、環境変数か既定値に戻ります。</p>
        <p style={{ marginBottom: 0 }}>
          <button type="submit">保存する</button>
        </p>
      </form>

      <p className="small muted">
        画面で設定できる項目の環境変数名: {Object.values(CONFIG_FIELDS).map((spec) => spec.env).join("、")}
        （画面の設定が優先されます）
      </p>
    </main>
  );
}
