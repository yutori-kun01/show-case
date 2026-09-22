import { notFound } from "next/navigation";
import { requireOpsSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDemoMedia, formatEnvSpecs } from "@/lib/services/setupForm";
import { OpsNav } from "../../OpsNav";
import {
  addMaskRuleAction,
  deleteMaskRuleAction,
  generateSnapshotAction,
  publishSnapshotAction,
  saveListingAction,
  setListingStatusAction,
  uploadMediaAction,
} from "../../actions";
import { ScanReportView } from "./ScanReportView";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ListingEditorPage({ params }: Props) {
  const { id } = await params;
  const { creator } = await requireOpsSession();
  const listing = await db().findOne("listings", { id, creator_id: creator.id });
  if (!listing) notFound();

  const repo = await db().findOne("repos", { id: listing.repo_id });
  const snapshots = (await db().select("snapshots", { listing_id: listing.id })).sort(
    (a, b) => b.version - a.version,
  );
  const rules = (await db().select("mask_rules", { creator_id: creator.id })).filter(
    (rule) => rule.listing_id === listing.id,
  );

  return (
    <main className="container">
      <OpsNav current="/listings" />
      <h1>{listing.title || "(無題)"}</h1>
      <p className="lead">
        元リポジトリ: <code>{repo?.full_name ?? "不明"}</code> ／ 公開URL: <code>/r/{listing.slug}</code>
      </p>

      <section>
        <h2>公開ページの内容</h2>
        <form className="panel" action={saveListingAction}>
          <input type="hidden" name="id" value={listing.id} />
          <label htmlFor="title">タイトル</label>
          <input id="title" name="title" type="text" defaultValue={listing.title} required />

          <label htmlFor="slug">slug（公開URLとZIPのルートフォルダ名）</label>
          <input id="slug" name="slug" type="text" defaultValue={listing.slug} required />

          <label htmlFor="summary">一行概要</label>
          <input id="summary" name="summary" type="text" defaultValue={listing.summary} />

          <label htmlFor="description">機能の説明</label>
          <textarea id="description" name="description" defaultValue={listing.description} />

          <label htmlFor="tags">機能タグ（カンマ区切り）</label>
          <input id="tags" name="tags" type="text" defaultValue={listing.tags.join(", ")} />

          <label htmlFor="hero_image">ヒーロー画像のURL</label>
          <input id="hero_image" name="hero_image" type="text" defaultValue={listing.hero_image ?? ""} />

          <label htmlFor="demo_media">デモ（1行に1件、`URL | image または video | 説明`）</label>
          <textarea id="demo_media" name="demo_media" defaultValue={formatDemoMedia(listing.demo_media)} />

          <h3>セットアップ設定</h3>
          <label htmlFor="requirements">必要な環境（1行に1件）</label>
          <textarea
            id="requirements"
            name="requirements"
            defaultValue={listing.setup_config.requirements.join("\n")}
            placeholder="Node.js 20以上"
          />

          <label htmlFor="setup">セットアップコマンド</label>
          <input id="setup" name="setup" type="text" defaultValue={listing.setup_config.setup} placeholder="npm install" />

          <label htmlFor="start">起動コマンド</label>
          <input id="start" name="start" type="text" defaultValue={listing.setup_config.start} placeholder="npm run dev" />

          <label htmlFor="open_url">起動後に開くURL</label>
          <input
            id="open_url"
            name="open_url"
            type="text"
            defaultValue={listing.setup_config.open_url}
            placeholder="http://localhost:3000"
          />

          <label htmlFor="env">env変数（1行に1件、`キー名 | 必須 | 説明 | 取得先URL`）</label>
          <textarea
            id="env"
            name="env"
            defaultValue={formatEnvSpecs(listing.setup_config.env)}
            placeholder="OPENAI_API_KEY | 必須 | OpenAIのAPIキー | https://platform.openai.com/api-keys"
          />

          <p style={{ marginBottom: 0 }}>
            <button type="submit">保存する</button>
          </p>
        </form>
      </section>

      <section>
        <h2>画像・動画のアップロード</h2>
        <form className="panel" action={uploadMediaAction}>
          <input type="hidden" name="listing_id" value={listing.id} />
          <label htmlFor="file">ファイル（PNG・JPEG・GIF・WebP・MP4・WebM。SVGは不可）</label>
          <input id="file" name="file" type="file" accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm" required />
          <label htmlFor="role">用途</label>
          <select id="role" name="role" defaultValue="demo">
            <option value="hero">ヒーロー画像</option>
            <option value="demo">デモ</option>
          </select>
          <p style={{ marginBottom: 0 }}>
            <button type="submit" className="secondary">
              アップロードする
            </button>
          </p>
        </form>
      </section>

      <section>
        <h2>このリポジトリ個別のマスク設定</h2>
        <div className="panel">
          {rules.length === 0 ? (
            <p className="muted small">個別の設定はありません（全体共通のみ適用されます）。</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>種別</th>
                  <th>パターン</th>
                  <th>置換後</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{rule.kind}</td>
                    <td>
                      <code>{rule.pattern}</code>
                    </td>
                    <td>
                      <code>{rule.replacement}</code>
                    </td>
                    <td>
                      <form action={deleteMaskRuleAction}>
                        <input type="hidden" name="id" value={rule.id} />
                        <button type="submit" className="danger">
                          削除
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <form action={addMaskRuleAction} className="row" style={{ marginTop: 12 }}>
            <input type="hidden" name="listing_id" value={listing.id} />
            <select name="kind" defaultValue="exclude" style={{ width: 140 }}>
              <option value="exclude">除外</option>
              <option value="replace">置換</option>
              <option value="ngword">NGワード</option>
            </select>
            <input type="text" name="pattern" placeholder="パターン" required style={{ width: 220 }} />
            <input type="text" name="replacement" placeholder="置換後（除外・NGワードは空欄）" style={{ width: 220 }} />
            <button type="submit" className="secondary">
              追加
            </button>
          </form>
        </div>
      </section>

      <section>
        <h2>スナップショット</h2>
        <form action={generateSnapshotAction} className="row">
          <input type="hidden" name="listing_id" value={listing.id} />
          <button type="submit">ZIPを生成する</button>
          <span className="small muted">push後も自動では再公開しません。生成して確認してから公開します。</span>
        </form>

        {snapshots.map((snapshot) => (
          <div className="panel" key={snapshot.id}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>第{snapshot.version}版</strong>
              <span className={`status ${snapshot.status}`}>{snapshot.status}</span>
            </div>
            <p className="small muted" style={{ margin: "6px 0" }}>
              {new Date(snapshot.created_at).toLocaleString("ja-JP")} ／{" "}
              {snapshot.zip_bytes ? `${Math.round(snapshot.zip_bytes / 1024)} KB` : "サイズ不明"} ／ ファイル{" "}
              {snapshot.scan_report?.file_count ?? 0} 件
            </p>
            {snapshot.scan_report && <ScanReportView report={snapshot.scan_report} />}
            {snapshot.status === "ready" && (
              <form action={publishSnapshotAction}>
                <input type="hidden" name="snapshot_id" value={snapshot.id} />
                <button type="submit">この版を公開する</button>
              </form>
            )}
            {snapshot.status === "blocked" && (
              <div className="notice error">
                検出があるため公開できません。マスク設定を直してから生成し直してください。
              </div>
            )}
          </div>
        ))}
      </section>

      <section>
        <h2>公開状態</h2>
        <form action={setListingStatusAction} className="panel row">
          <input type="hidden" name="id" value={listing.id} />
          <select name="status" defaultValue={listing.status} style={{ width: 200 }}>
            <option value="draft">下書き</option>
            <option value="published">公開</option>
            <option value="unlisted">非公開</option>
          </select>
          <button type="submit" className="secondary">
            変更する
          </button>
        </form>
      </section>
    </main>
  );
}
