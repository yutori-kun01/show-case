import { requireOpsSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { OpsNav } from "../OpsNav";
import { createListingAction, syncReposAction, toggleRepoAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ReposPage() {
  const { creator } = await requireOpsSession();
  const repos = await db().select("repos", { creator_id: creator.id });
  const listings = await db().select("listings", { creator_id: creator.id });
  const listingByRepo = new Map(listings.map((listing) => [listing.repo_id, listing]));

  return (
    <main className="container">
      <OpsNav current="/repos" />
      <h1>リポジトリ</h1>
      <p className="lead">
        パブリックはユーザー名から、プライベートはGitHub Appのインストールから取り込みます。
      </p>

      <form action={syncReposAction} className="row">
        <button type="submit">GitHubから取り込む</button>
        <span className="small muted">
          {creator.github_login ? `ユーザー: ${creator.github_login}` : "CREATOR_GITHUB_LOGIN が未設定です"}
        </span>
      </form>

      {repos.length === 0 ? (
        <div className="panel">
          <p className="muted">まだ取り込んでいません。</p>
        </div>
      ) : (
        <div className="panel">
          <table>
            <thead>
              <tr>
                <th>リポジトリ</th>
                <th>公開範囲</th>
                <th>選択</th>
                <th>公開ページ</th>
              </tr>
            </thead>
            <tbody>
              {repos.map((repo) => {
                const listing = listingByRepo.get(repo.id);
                return (
                  <tr key={repo.id}>
                    <td>
                      <code>{repo.full_name}</code>
                      <div className="small muted">{repo.default_branch}</div>
                    </td>
                    <td>{repo.visibility === "private" ? "プライベート" : "パブリック"}</td>
                    <td>
                      <form action={toggleRepoAction}>
                        <input type="hidden" name="repo_id" value={repo.id} />
                        <input type="hidden" name="selected" value={repo.selected ? "0" : "1"} />
                        <button type="submit" className="secondary">
                          {repo.selected ? "選択を外す" : "選択する"}
                        </button>
                      </form>
                    </td>
                    <td>
                      {listing ? (
                        <span className="small">作成済み（{listing.slug}）</span>
                      ) : (
                        <form action={createListingAction} className="row">
                          <input type="hidden" name="repo_id" value={repo.id} />
                          <input type="text" name="slug" placeholder="公開slug" style={{ width: 160 }} />
                          <button type="submit" className="secondary">
                            下書きを作る
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
