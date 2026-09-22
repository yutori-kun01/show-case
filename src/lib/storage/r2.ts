import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";
import type { StorageAdapter } from "./adapter";

/** Cloudflare R2（S3互換）。ZIPと画像・動画の保存先。 */
export class R2Storage implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = env.required("R2_BUCKET");
    this.client = new S3Client({
      region: "auto",
      endpoint: env.required("R2_ENDPOINT"),
      credentials: {
        accessKeyId: env.required("R2_ACCESS_KEY_ID"),
        secretAccessKey: env.required("R2_SECRET_ACCESS_KEY"),
      },
    });
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
    return { key, bytes: body.byteLength };
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new Error(`${key} が見つかりません`);
    return Buffer.from(bytes);
  }

  async signedUrl(key: string, ttlSeconds: number, downloadName?: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: downloadName
        ? `attachment; filename="${downloadName}"`
        : undefined,
    });
    return getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
  }

  publicUrl(key: string): string {
    const base = env.required("R2_PUBLIC_BASE_URL").replace(/\/+$/, "");
    return `${base}/${key}`;
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
