import { requireOpsSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSiteSettings } from "@/lib/services/access";
import { OpsNav } from "../OpsNav";
import {
  addViewersAction,
  removeViewerAction,
  saveAccessSettingsAction,
  setViewerStatusAction,
} from "../actions";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ added?: string; existing?: string; invalid?: string }>;
}

const MODES = [
  { value: "open", label: "誰でも見られる", help: "ログインなし。ダウンロードのときだけメールアドレスを入力してもらいます。" },
  { value: "register", label: "メール登録した人だけ", help: "誰でも登録できます。登録した人は下の一覧に自動で追加されます。" },
  { value: "allowlist", label: "登録済みのメールアドレスだけ", help: "下の一覧にあるメールアドレスだけがログインできます（受講者に限定するならこれ）。" },
] as const;

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString("ja-JP") : "—";
}

export default async function ViewersPage({ searchParams }: Props) {
  const { creator } = await requireOpsSession();
  const params = await searchParams;
  const settings = await getSiteSettings(creator);
  const viewers = (await db().select("viewers", { creator_id: creator.id })).sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  const active = viewers.filter((viewer) => viewer.status === "active");
  const exportText = active.map((viewer) => viewer.email).join("\n");

  return (
    <main className="container">
      <OpsNav current="/viewers" />
      <h1>閲覧者</h1>
      <p className="lead">公開側を誰に見せるかを決めます。URLを共有した相手がログイン画面から入ります。</p>

      <form className="panel" action={saveAccessSettingsAction}>
        <h2 style={{ marginTop: 0 }}>閲覧制限</h2>
        {MODES.map((mode) => (
          <div className="checkbox" key={mode.value}>
            <input
              id={`mode-${mode.value}`}
              type="radio"
              name="access_mode"
              value={mode.value}
              defaultChecked={settings.access_mode === mode.value}
            />
            <label htmlFor={`mode-${mode.value}`} style={{ margin: 0, color: "inherit" }}>
              <strong>{mode.label}</strong>
              <div className="small muted">{mode.help}</div>
            </label>
          </div>
        ))}
        <div className="checkbox">
          <input id="verify_email" type="checkbox" name="verify_email" value="1" defaultChecked={settings.verify_email} />
          <label htmlFor="verify_email" style={{ margin: 0, color: "inherit" }}>
            メールに届く6桁のコードで本人確認する
            <div className="small muted">
              外すと、メールアドレスを入れるだけで入れます（手軽ですが、他人のアドレスでも入れてしまいます）。
            </div>
          </label>
        </div>
        <button type="submit">保存する</button>
        <p className="small muted" style={{ marginBottom: 0 }}>
          メール送信: {env.mailDriver === "smtp" ? "SMTP で送信中" : "未設定（コードはコンソールと .data/mail.log に出ます）"}
          {env.siteUrl && (
            <>
              {" "}
              ／ 共有するURL: <code>{env.siteUrl}</code>
            </>
          )}
        </p>
      </form>

      <form className="panel" action={addViewersAction}>
        <h2 style={{ marginTop: 0 }}>メールアドレスを登録</h2>
        {params.added !== undefined && (
          <div className="notice ok">
            {params.added} 件を登録しました（登録済み {params.existing ?? 0} 件、形式エラー {params.invalid ?? 0} 件）
          </div>
        )}
        <label htmlFor="emails">メールアドレス（改行・カンマ区切りでまとめて貼り付けられます）</label>
        <textarea id="emails" name="emails" required placeholder={"a@example.com\nb@example.com"} />
        <label htmlFor="note">メモ（任意。例: 2026年10月期）</label>
        <input id="note" name="note" type="text" />
        <p style={{ marginBottom: 0 }}>
          <button type="submit">登録する</button>
        </p>
      </form>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>
          一覧（有効 {active.length} 件 ／ 全 {viewers.length} 件）
        </h2>
        {viewers.length === 0 ? (
          <p className="muted">まだ登録がありません。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>メールアドレス</th>
                <th>登録元</th>
                <th>最終ログイン</th>
                <th>状態</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {viewers.map((viewer) => (
                <tr key={viewer.id}>
                  <td>
                    {viewer.email}
                    {viewer.note && <div className="small muted">{viewer.note}</div>}
                  </td>
                  <td className="small">{viewer.source === "invited" ? "運営が登録" : "本人が登録"}</td>
                  <td className="small">{formatDate(viewer.last_login_at)}</td>
                  <td>
                    <span className={`status ${viewer.status === "active" ? "published" : "blocked"}`}>
                      {viewer.status === "active" ? "有効" : "停止中"}
                    </span>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <form action={setViewerStatusAction}>
                        <input type="hidden" name="id" value={viewer.id} />
                        <input type="hidden" name="status" value={viewer.status === "active" ? "blocked" : "active"} />
                        <button type="submit" className="secondary">
                          {viewer.status === "active" ? "停止" : "再開"}
                        </button>
                      </form>
                      <form action={removeViewerAction}>
                        <input type="hidden" name="id" value={viewer.id} />
                        <button type="submit" className="danger">
                          削除
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {active.length > 0 && (
          <>
            <label htmlFor="export">有効なメールアドレス（コピー用）</label>
            {/* 停止・削除のあとも中身が更新されるよう、内容を key にする */}
            <textarea id="export" readOnly key={exportText} defaultValue={exportText} />
          </>
        )}
      </div>
    </main>
  );
}
