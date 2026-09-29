import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { StorageAdapter } from "./adapter";

/**
 * Supabase Storage（非公開バケット）。DBと同じアカウントで済むので、無料で小さく運用したいとき向け。
 * 画像・動画も非公開のまま置き、/api/media から短時間の署名付きURLへ転送する。
 * バケットがなければ、最初の保存のときに非公開で作る。
 */
export class SupabaseStorage implements StorageAdapter {
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor(client?: SupabaseClient) {
    this.bucket = env.supabaseStorageBucket;
    this.client =
      client ??
      createClient(env.required("SUPABASE_URL"), env.required("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false, autoRefreshToken: false },
      });
  }

  async put(key: string, body: Buffer, contentType: string) {
    const upload = () =>
      this.client.storage.from(this.bucket).upload(key, body, { contentType, upsert: true });
    let { error } = await upload();
    if (error && /bucket not found/i.test(error.message)) {
      await this.ensureBucket();
      ({ error } = await upload());
    }
    if (error) throw new Error(`${key} の保存に失敗しました: ${error.message}`);
    return { key, bytes: body.byteLength };
  }

  /** 非公開のバケットを作る。すでにあれば何もしない。 */
  async ensureBucket(): Promise<void> {
    const { data } = await this.client.storage.getBucket(this.bucket);
    if (data) return;
    const { error } = await this.client.storage.createBucket(this.bucket, { public: false });
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`バケット ${this.bucket} を作れませんでした: ${error.message}`);
    }
  }

  async get(key: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(this.bucket).download(key);
    if (error || !data) throw new Error(`${key} が見つかりません`);
    return Buffer.from(await data.arrayBuffer());
  }

  async signedUrl(key: string, ttlSeconds: number, downloadName?: string): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(key, ttlSeconds, downloadName ? { download: downloadName } : undefined);
    if (error || !data) throw new Error(`${key} の署名付きURLを作れませんでした`);
    return data.signedUrl;
  }

  publicUrl(key: string): string {
    return `/api/media?key=${encodeURIComponent(key)}`;
  }

  async remove(key: string): Promise<void> {
    await this.client.storage.from(this.bucket).remove([key]);
  }
}
