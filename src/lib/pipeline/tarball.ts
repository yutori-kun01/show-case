import zlib from "node:zlib";
import { promisify } from "node:util";
import tar from "tar-stream";

const gunzip = promisify(zlib.gunzip);

export interface RepoFile {
  /** 先頭の `owner-repo-sha/` を取り除いた相対パス。 */
  path: string;
  content: Buffer;
  mode: number;
}

/**
 * tarball を展開する。GitHub標準の tarball は `owner-repo-sha/` が先頭に付き
 * アカウント名が漏れるため、ここで必ず剥がす。
 */
export async function extractTarball(tarball: Buffer): Promise<RepoFile[]> {
  const raw = tarball[0] === 0x1f && tarball[1] === 0x8b ? await gunzip(tarball) : tarball;
  const extract = tar.extract();
  const files: RepoFile[] = [];

  const done = new Promise<void>((resolve, reject) => {
    extract.on("entry", (header, stream, next) => {
      if (header.type !== "file") {
        stream.resume();
        stream.on("end", next);
        return;
      }
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: unknown) => chunks.push(Buffer.from(chunk as Uint8Array)));
      stream.on("end", () => {
        files.push({
          path: stripRootDirectory(header.name),
          content: Buffer.concat(chunks),
          mode: header.mode ?? 0o644,
        });
        next();
      });
      stream.on("error", reject);
    });
    extract.on("finish", resolve);
    extract.on("error", reject);
  });

  extract.end(raw);
  await done;
  return files.filter((file) => file.path.length > 0);
}

export function stripRootDirectory(name: string): string {
  const normalized = name.replace(/^\.\//, "");
  const index = normalized.indexOf("/");
  return index < 0 ? "" : normalized.slice(index + 1);
}
