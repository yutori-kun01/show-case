/**
 * ローカル代替（JSON＋ファイルシステム＋fixtures）で一通り動かすための初期データ投入。
 * 実行: npm run seed
 */
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { setGithub } from "@/lib/github";
import { LocalGithub } from "@/lib/github/local";
import { syncRepos } from "@/lib/services/repos";
import { createSnapshot, publishSnapshot } from "@/lib/services/snapshots";
import { EMPTY_SETUP_CONFIG } from "@/lib/pipeline/templates";

async function main(): Promise<void> {
  if (env.dbDriver !== "local") {
    throw new Error("このスクリプトはローカル代替でのみ使います");
  }
  // 実行環境に GITHUB_TOKEN があっても、投入用のデータは fixtures から作る。
  setGithub(new LocalGithub(env.optional("LOCAL_REPOS_DIR") ?? "fixtures/repos"));

  const creator =
    (await db().select("creators"))[0] ??
    (await db().insert("creators", {
      display_name: env.optional("CREATOR_DISPLAY_NAME") ?? "運営",
      github_login: env.optional("CREATOR_GITHUB_LOGIN") ?? "sample-owner",
      github_installation_id: null,
    }));

  const repos = await syncRepos(creator);
  console.info(`リポジトリを ${repos.length} 件取り込みました。`);

  const repo = repos.find((item) => item.full_name.endsWith("/todo-tool")) ?? repos[0];
  if (!repo) throw new Error("fixtures/repos にリポジトリがありません");

  const existing = await db().findOne("listings", { repo_id: repo.id });
  const listing =
    existing ??
    (await db().insert("listings", {
      creator_id: creator.id,
      repo_id: repo.id,
      slug: "todo-tool",
      title: "Todo Tool",
      summary: "ブラウザで動く小さなTodo管理ツール",
      description: "追加・完了・削除ができます。データはメモリ上に保持します。",
      tags: ["Todo", "Node.js"],
      hero_image: null,
      demo_media: [],
      setup_config: {
        ...EMPTY_SETUP_CONFIG,
        requirements: ["Node.js 20以上"],
        setup: "npm install",
        start: "npm run dev",
        open_url: "http://localhost:3000",
        env: [{ key: "PORT", required: false, description: "待ち受けポート", how_to_get: "" }],
      },
      status: "published",
      updated_at: new Date().toISOString(),
    }));

  await db().insert("mask_rules", {
    creator_id: creator.id,
    listing_id: null,
    kind: "replace",
    pattern: creator.github_login ?? "sample-owner",
    replacement: creator.display_name,
  });

  const snapshot = await createSnapshot(listing.id);
  console.info(
    `第${snapshot.version}版を作成しました（状態: ${snapshot.status}、検出 ${snapshot.scan_report?.findings.length ?? 0} 件）。`,
  );
  if (snapshot.status === "ready") {
    await publishSnapshot(snapshot.id);
    console.info("公開しました: /r/" + listing.slug);
  } else {
    console.info("検出があるため公開していません。運営側の画面で確認してください。");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
