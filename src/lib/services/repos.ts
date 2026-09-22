import { db } from "@/lib/db";
import type { Creator, Repo } from "@/lib/db/types";
import { github } from "@/lib/github";

/** GitHubから取り込み、既存の行は更新する。選択状態は保つ。 */
export async function syncRepos(creator: Creator): Promise<Repo[]> {
  const remote = await (await github()).listRepos({
    login: creator.github_login ?? undefined,
    installationId: creator.github_installation_id ?? undefined,
  });

  for (const item of remote) {
    const existing = await db().findOne("repos", {
      creator_id: creator.id,
      github_repo_id: item.github_repo_id,
    });
    if (existing) {
      await db().update("repos", existing.id, {
        full_name: item.full_name,
        visibility: item.visibility,
        default_branch: item.default_branch,
      });
    } else {
      await db().insert("repos", {
        creator_id: creator.id,
        github_repo_id: item.github_repo_id,
        full_name: item.full_name,
        visibility: item.visibility,
        default_branch: item.default_branch,
        selected: false,
      });
    }
  }
  return db().select("repos", { creator_id: creator.id });
}

export async function setRepoSelected(repoId: string, selected: boolean): Promise<Repo> {
  return db().update("repos", repoId, { selected });
}
