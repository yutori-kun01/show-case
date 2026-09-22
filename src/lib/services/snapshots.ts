import { db } from "@/lib/db";
import type { Listing, Snapshot } from "@/lib/db/types";
import { github } from "@/lib/github";
import { storage } from "@/lib/storage";
import { extractTarball } from "@/lib/pipeline/tarball";
import { runPipeline } from "@/lib/pipeline/run";
import { resolveMaskRules } from "./masking";

/**
 * スナップショットを1版作る。取得からZIP保存までをこの関数で完結させる。
 * Vercelの関数の実行時間に収まらない場合は、この関数をジョブ基盤から呼ぶ。
 */
export async function createSnapshot(listingId: string): Promise<Snapshot> {
  const listing = await db().findOne("listings", { id: listingId });
  if (!listing) throw new Error("公開ページが見つかりません");

  const repo = await db().findOne("repos", { id: listing.repo_id });
  if (!repo) throw new Error("リポジトリが見つかりません");

  const creator = await db().findOne("creators", { id: listing.creator_id });
  if (!creator) throw new Error("出品者が見つかりません");

  const client = await github();
  const commitSha = await client.headCommit(repo.full_name, repo.default_branch);
  const tarball = await client.tarball(repo.full_name, commitSha);
  const files = await extractTarball(tarball);

  const mask = await resolveMaskRules(creator, listing.id);
  const result = await runPipeline({
    slug: listing.slug,
    title: listing.title,
    setupConfig: listing.setup_config,
    files,
    excludePatterns: mask.excludePatterns,
    replaceRules: mask.replaceRules,
    ngWords: mask.ngWords,
  });

  const version = (await nextVersion(listing.id));
  const zipPath = `snapshots/${listing.slug}/${listing.slug}-v${version}.zip`;

  // 検出があれば公開を止めるが、運営が中身を確認できるようZIP自体は保存する。
  await storage().put(zipPath, result.zip, "application/zip");

  return db().insert("snapshots", {
    listing_id: listing.id,
    commit_sha: commitSha,
    version,
    zip_path: zipPath,
    zip_bytes: result.zip.byteLength,
    scan_report: result.report,
    status: result.blocked ? "blocked" : "ready",
  });
}

async function nextVersion(listingId: string): Promise<number> {
  const snapshots = await db().select("snapshots", { listing_id: listingId });
  return snapshots.reduce((max, snapshot) => Math.max(max, snapshot.version), 0) + 1;
}

/** 検出結果を確認したうえで公開する。公開中の版は常に1つ。 */
export async function publishSnapshot(snapshotId: string): Promise<Snapshot> {
  const snapshot = await db().findOne("snapshots", { id: snapshotId });
  if (!snapshot) throw new Error("スナップショットが見つかりません");
  if (snapshot.status === "blocked") {
    throw new Error("検出があるため公開できません。マスク設定を直してから再生成してください");
  }

  for (const other of await db().select("snapshots", { listing_id: snapshot.listing_id })) {
    if (other.id !== snapshot.id && other.status === "published") {
      await db().update("snapshots", other.id, { status: "archived" });
    }
  }
  return db().update("snapshots", snapshot.id, { status: "published" });
}

/** 公開中の版。なければ null。 */
export async function publishedSnapshot(listing: Listing): Promise<Snapshot | null> {
  return db().findOne("snapshots", { listing_id: listing.id, status: "published" });
}
