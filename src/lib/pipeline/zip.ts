import yazl from "yazl";

export interface ZipEntry {
  path: string;
  content: Buffer;
  mode?: number;
}

/**
 * ルートフォルダ名を `<公開slug>/` にしてZIP化する。
 * GitHub標準のZIP（`owner-repo-sha/`）は使わない。
 */
export async function buildZip(rootName: string, entries: ZipEntry[]): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  // 版ごとに同じ内容なら同じZIPになるよう、日時は固定する。
  const mtime = new Date(0);
  for (const entry of [...entries].sort((a, b) => a.path.localeCompare(b.path))) {
    zip.addBuffer(entry.content, `${rootName}/${entry.path}`, { mtime, mode: entry.mode ?? 0o644 });
  }
  zip.end();

  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
