import { requireOpsSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_EXCLUDES } from "@/lib/pipeline/exclude";
import { DEFAULT_NG_WORDS } from "@/lib/pipeline/scan";
import { OpsNav } from "../OpsNav";
import { addMaskRuleAction, deleteMaskRuleAction } from "../actions";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  exclude: "除外",
  replace: "置換",
  ngword: "NGワード",
};

export default async function MaskPage() {
  const { creator } = await requireOpsSession();
  const rules = (await db().select("mask_rules", { creator_id: creator.id })).filter(
    (rule) => rule.listing_id === null,
  );

  return (
    <main className="container">
      <OpsNav current="/mask" />
      <h1>マスク設定（全体共通）</h1>
      <p className="lead">
        ここの設定はすべてのリポジトリに適用されます。個別の追加は各公開ページの編集画面から行います。
      </p>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>登録済み</h2>
        {rules.length === 0 ? (
          <p className="muted small">まだありません。既定の除外とNGワードだけが適用されます。</p>
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
                  <td>{KIND_LABEL[rule.kind]}</td>
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
          <select name="kind" defaultValue="replace" style={{ width: 140 }}>
            <option value="exclude">除外</option>
            <option value="replace">置換</option>
            <option value="ngword">NGワード</option>
          </select>
          <input type="text" name="pattern" placeholder="パターン（/正規表現/ も使えます）" required style={{ width: 260 }} />
          <input type="text" name="replacement" placeholder="置換後（除外・NGワードは空欄）" style={{ width: 220 }} />
          <button type="submit" className="secondary">
            追加
          </button>
        </form>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>既定の除外</h2>
        <p className="small muted">
          <code>{DEFAULT_EXCLUDES.join("　")}</code> と、実行ファイル・バイナリ。
        </p>
        <h2>既定のNGワード</h2>
        <p className="small muted">
          <code>{DEFAULT_NG_WORDS.join("　")}</code>
          {" "}と出品者のGitHubユーザー名。これらは置換せず、検出して確認だけを行います。
        </p>
      </div>
    </main>
  );
}
