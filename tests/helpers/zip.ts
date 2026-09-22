import yauzl from "yauzl";

export interface ZipEntryRead {
  path: string;
  content: string;
  mode: number;
}

/** テスト用のZIP読み取り。 */
export function readZip(buffer: Buffer): Promise<ZipEntryRead[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error);
      const entries: ZipEntryRead[] = [];
      zip.on("entry", (entry) => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return reject(streamError);
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => {
            entries.push({
              path: entry.fileName,
              content: Buffer.concat(chunks).toString("utf8"),
              mode: (entry.externalFileAttributes >>> 16) & 0o7777,
            });
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => resolve(entries));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}
