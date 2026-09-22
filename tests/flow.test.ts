import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setDb } from "@/lib/db";
import { LocalDb } from "@/lib/db/local";
import { setStorage } from "@/lib/storage";
import { LocalStorage } from "@/lib/storage/local";
import { setGithub } from "@/lib/github";
import { LocalGithub } from "@/lib/github/local";
import { db } from "@/lib/db";
import { createSnapshot, publishSnapshot } from "@/lib/services/snapshots";
import { DownloadError, requestDownload } from "@/lib/services/downloads";
import { EMPTY_SETUP_CONFIG } from "@/lib/pipeline/templates";

let workDir: string;

async function seed() {
  const creator = await db().insert("creators", {
    display_name: "運営",
    github_login: "sample-owner",
    github_installation_id: null,
  });
  const repo = await db().insert("repos", {
    creator_id: creator.id,
    github_repo_id: "1",
    full_name: "sample-owner/todo-tool",
    visibility: "private",
    default_branch: "main",
    selected: true,
  });
  const listing = await db().insert("listings", {
    creator_id: creator.id,
    repo_id: repo.id,
    slug: "todo-tool",
    title: "Todo Tool",
    summary: "小さなTodo管理ツール",
    description: "",
    tags: ["CLI"],
    hero_image: null,
    demo_media: [],
    setup_config: { ...EMPTY_SETUP_CONFIG, setup: "npm install", start: "npm run dev" },
    status: "published",
    updated_at: new Date().toISOString(),
  });
  return { creator, repo, listing };
}

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "showcase-"));
  setDb(new LocalDb(path.join(workDir, "db.json")));
  setStorage(new LocalStorage(path.join(workDir, "storage")));
  setGithub(new LocalGithub("fixtures/repos"));
  process.env.DOWNLOAD_RATE_LIMIT_PER_HOUR = "2";
});

afterEach(async () => {
  setDb(null);
  setStorage(null);
  setGithub(null);
  delete process.env.DOWNLOAD_RATE_LIMIT_PER_HOUR;
  await fs.rm(workDir, { recursive: true, force: true });
});

describe("スナップショットの公開", () => {
  it("版を重ね、公開中は常に1つだけにする", async () => {
    const { listing } = await seed();
    const first = await createSnapshot(listing.id);
    expect(first.version).toBe(1);
    expect(first.status).toBe("ready");
    await publishSnapshot(first.id);

    const second = await createSnapshot(listing.id);
    expect(second.version).toBe(2);
    await publishSnapshot(second.id);

    const published = await db().select("snapshots", { status: "published" });
    expect(published).toHaveLength(1);
    expect(published[0].version).toBe(2);
  });

  it("ZIPをストレージに保存する", async () => {
    const { listing } = await seed();
    const snapshot = await createSnapshot(listing.id);
    expect(snapshot.zip_path).toBe("snapshots/todo-tool/todo-tool-v1.zip");
    const stored = await fs.readFile(path.join(workDir, "storage", snapshot.zip_path!));
    expect(stored.byteLength).toBe(snapshot.zip_bytes);
  });

  it("検出があれば公開できない", async () => {
    const { listing } = await seed();
    const snapshot = await createSnapshot(listing.id);
    await db().update("snapshots", snapshot.id, { status: "blocked" });
    await expect(publishSnapshot(snapshot.id)).rejects.toThrow("公開できません");
  });
});

describe("ダウンロード", () => {
  it("メールを記録して署名付きURLを返す", async () => {
    const { listing } = await seed();
    await publishSnapshot((await createSnapshot(listing.id)).id);

    const grant = await requestDownload({
      slug: "todo-tool",
      email: "User@Example.com",
      consentNewsletter: true,
    });
    expect(grant.fileName).toBe("todo-tool-v1.zip");
    expect(grant.url).toContain("sig=");

    const downloads = await db().select("downloads");
    expect(downloads).toHaveLength(1);
    expect(downloads[0].email).toBe("user@example.com");
    expect(downloads[0].consent_newsletter).toBe(true);
  });

  it("同じメールアドレスの連続ダウンロードを制限する", async () => {
    const { listing } = await seed();
    await publishSnapshot((await createSnapshot(listing.id)).id);
    const request = { slug: "todo-tool", email: "user@example.com", consentNewsletter: false };
    await requestDownload(request);
    await requestDownload(request);
    await expect(requestDownload(request)).rejects.toBeInstanceOf(DownloadError);
  });

  it("公開されていないものは配布しない", async () => {
    const { listing } = await seed();
    await createSnapshot(listing.id); // 公開せずに置く
    await expect(
      requestDownload({ slug: "todo-tool", email: "user@example.com", consentNewsletter: false }),
    ).rejects.toThrow("配布できる版がまだありません");
  });

  it("メールアドレスの形式を確かめる", async () => {
    await expect(
      requestDownload({ slug: "todo-tool", email: "not-an-email", consentNewsletter: false }),
    ).rejects.toThrow("メールアドレス");
  });
});
