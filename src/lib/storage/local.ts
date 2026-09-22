import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import type { StorageAdapter } from "./adapter";
import { sign } from "./signing";

/** ローカルのファイルシステムに保存する代替ストレージ。 */
export class LocalStorage implements StorageAdapter {
  constructor(private readonly root = path.join(env.dataDir, "storage")) {}

  /** キーにパス区切りの遡りが混ざらないようにする。 */
  private resolve(key: string): string {
    const normalized = path.posix.normalize(key).replace(/^(\.\.(\/|$))+/, "");
    const full = path.join(this.root, normalized);
    if (!full.startsWith(path.resolve(this.root) + path.sep) && full !== path.resolve(this.root)) {
      if (!path.resolve(full).startsWith(path.resolve(this.root))) {
        throw new Error("不正なストレージキーです");
      }
    }
    return full;
  }

  async put(key: string, body: Buffer): Promise<{ key: string; bytes: number }> {
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
    return { key, bytes: body.byteLength };
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async signedUrl(key: string, ttlSeconds: number, downloadName?: string): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const params = new URLSearchParams({ key, exp: String(expiresAt), sig: sign(key, expiresAt) });
    if (downloadName) params.set("name", downloadName);
    return `/api/files?${params.toString()}`;
  }

  publicUrl(key: string): string {
    return `/api/media?key=${encodeURIComponent(key)}`;
  }

  async remove(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }
}
