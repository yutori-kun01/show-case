import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { promisify } from "node:util";
import tar from "tar-stream";
import { env } from "@/lib/env";
import type { GithubAdapter, RemoteRepo } from "./adapter";

const gzip = promisify(zlib.gzip);

/**
 * 認証情報なしで動かすための代替アダプタ。
 * fixtures/repos/<owner>/<repo>/ をリポジトリとして扱い、tarball を組み立てる。
 */
export class LocalGithub implements GithubAdapter {
  constructor(private readonly root = env.optional("LOCAL_REPOS_DIR") ?? "fixtures/repos") {}

  async listRepos(): Promise<RemoteRepo[]> {
    const repos: RemoteRepo[] = [];
    for (const owner of await this.readDirs(this.root)) {
      for (const name of await this.readDirs(path.join(this.root, owner))) {
        const full_name = `${owner}/${name}`;
        repos.push({
          github_repo_id: crypto.createHash("sha1").update(full_name).digest("hex").slice(0, 12),
          full_name,
          visibility: "private",
          default_branch: "main",
          description: null,
        });
      }
    }
    return repos;
  }

  /** 内容のハッシュを擬似コミットSHAとして使う（内容が変われば版も変わる）。 */
  async headCommit(fullName: string): Promise<string> {
    const files = await this.walk(this.dirOf(fullName));
    const hash = crypto.createHash("sha1");
    for (const file of files.sort()) {
      hash.update(file);
      hash.update(await fs.readFile(path.join(this.dirOf(fullName), file)));
    }
    return hash.digest("hex");
  }

  async tarball(fullName: string, ref: string): Promise<Buffer> {
    const dir = this.dirOf(fullName);
    const pack = tar.pack();
    // GitHub標準の tarball と同じく owner-repo-sha/ を先頭に付ける（後段で剥がす対象）。
    const prefix = `${fullName.replace("/", "-")}-${ref.slice(0, 7)}`;
    for (const relative of await this.walk(dir)) {
      const body = await fs.readFile(path.join(dir, relative));
      pack.entry({ name: `${prefix}/${relative}`, mode: 0o644 }, body);
    }
    pack.finalize();
    const chunks: Buffer[] = [];
    for await (const chunk of pack) chunks.push(Buffer.from(chunk as Uint8Array));
    return gzip(Buffer.concat(chunks));
  }

  private dirOf(fullName: string): string {
    const [owner, repo] = fullName.split("/");
    return path.join(this.root, owner, repo);
  }

  private async readDirs(dir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async walk(dir: string, base = ""): Promise<string[]> {
    const entries = await fs.readdir(path.join(dir, base), { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const relative = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) files.push(...(await this.walk(dir, relative)));
      else if (entry.isFile()) files.push(relative);
    }
    return files;
  }
}
