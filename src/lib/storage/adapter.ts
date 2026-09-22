export interface StorageAdapter {
  put(key: string, body: Buffer, contentType: string): Promise<{ key: string; bytes: number }>;
  get(key: string): Promise<Buffer>;
  /** 有効期限付きのダウンロードURLを返す（目安は10分）。 */
  signedUrl(key: string, ttlSeconds: number, downloadName?: string): Promise<string>;
  /** 画像・動画など、公開してよいものの固定URL。 */
  publicUrl(key: string): string;
  remove(key: string): Promise<void>;
}
