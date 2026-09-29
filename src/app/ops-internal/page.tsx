import Link from "next/link";
import { requireOpsSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { opsUrl } from "@/lib/opsPath";
import { getSiteSettings } from "@/lib/services/access";
import { getConfig } from "@/lib/config";
import { OpsNav } from "./OpsNav";
import { signOutAction } from "./login/actions";

export const dynamic = "force-dynamic";

export default async function OpsHomePage() {
  const { email, creator } = await requireOpsSession();
  const [repos, listings, snapshots, downloads, reports, viewers, settings, config] = await Promise.all([
    db().select("repos", { creator_id: creator.id }),
    db().select("listings", { creator_id: creator.id }),
    db().select("snapshots"),
    db().select("downloads"),
    db().select("reports", { status: "open" }),
    db().select("viewers", { creator_id: creator.id }),
    getSiteSettings(creator),
    getConfig(creator),
  ]);

  return (
    <main className="container">
      <OpsNav current="/" />
      <h1>ホーム</h1>
      <p className="lead">
        {email} でログイン中 ／ 出品者: {creator.display_name}
      </p>

      <div className="panel">
        <table>
          <tbody>
            <tr>
              <th>取り込んだリポジトリ</th>
              <td>{repos.length} 件（選択中 {repos.filter((repo) => repo.selected).length} 件）</td>
            </tr>
            <tr>
              <th>公開ページ</th>
              <td>
                {listings.length} 件（公開中 {listings.filter((listing) => listing.status === "published").length} 件）
              </td>
            </tr>
            <tr>
              <th>スナップショット</th>
              <td>
                {snapshots.length} 版（要確認 {snapshots.filter((snapshot) => snapshot.status === "blocked").length} 版）
              </td>
            </tr>
            <tr>
              <th>ダウンロード</th>
              <td>
                {downloads.length} 件（ニュースレター同意 {downloads.filter((row) => row.consent_newsletter).length} 件）
              </td>
            </tr>
            <tr>
              <th>閲覧者</th>
              <td>
                有効 {viewers.filter((viewer) => viewer.status === "active").length} 件（
                {{ open: "誰でも見られる", register: "メール登録した人だけ", allowlist: "登録済みのメールだけ" }[settings.access_mode]}）
              </td>
            </tr>
            <tr>
              <th>未対応の通報</th>
              <td>{reports.length} 件</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="panel tight small muted">
        接続先: DB={env.dbDriver} ／ ストレージ={env.storageDriver} ／ GitHub={config.githubDriver} ／ メール={config.mailDriver}
        {env.dbDriver === "local" && "（ローカル代替で動作中）"}{" "}
        <Link href={opsUrl("/settings")}>セットアップを確認する</Link>
      </div>

      <div className="row">
        <Link className="button secondary" href={opsUrl("/repos")}>
          リポジトリを取り込む
        </Link>
        <form action={signOutAction}>
          <button type="submit" className="secondary">
            ログアウト
          </button>
        </form>
      </div>
    </main>
  );
}
