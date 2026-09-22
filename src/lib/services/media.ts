import crypto from "node:crypto";
import { storage } from "@/lib/storage";

/** 画像・動画のアップロード。形式とサイズを制限し、SVGは受け付けない。 */
const IMAGE_TYPES: Record<string, { extension: string; magic: string[] }> = {
  "image/png": { extension: "png", magic: ["89504e47"] },
  "image/jpeg": { extension: "jpg", magic: ["ffd8ff"] },
  "image/gif": { extension: "gif", magic: ["47494638"] },
  "image/webp": { extension: "webp", magic: ["52494646"] },
};

const VIDEO_TYPES: Record<string, { extension: string; magic: string[] }> = {
  "video/mp4": { extension: "mp4", magic: ["00000018", "00000020", "0000001c", "66747970"] },
  "video/webm": { extension: "webm", magic: ["1a45dfa3"] },
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 30 * 1024 * 1024;

export class MediaError extends Error {}

export interface UploadedMedia {
  url: string;
  kind: "image" | "video";
}

export async function uploadMedia(file: File): Promise<UploadedMedia> {
  const type = file.type.toLowerCase();
  const image = IMAGE_TYPES[type];
  const video = VIDEO_TYPES[type];
  if (!image && !video) {
    throw new MediaError("対応しているのは PNG・JPEG・GIF・WebP・MP4・WebM です（SVGは受け付けません）");
  }

  const limit = image ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (file.size > limit) {
    throw new MediaError(`ファイルが大きすぎます（上限 ${Math.round(limit / 1024 / 1024)}MB）`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const spec = image ?? video!;
  if (!matchesMagic(buffer, spec.magic)) {
    throw new MediaError("ファイルの中身が指定された形式と一致しません");
  }

  const key = `media/${crypto.randomUUID()}.${spec.extension}`;
  await storage().put(key, buffer, type);
  return { url: storage().publicUrl(key), kind: image ? "image" : "video" };
}

/** mp4 は先頭4バイトがサイズ、5〜8バイト目が `ftyp` になる。 */
function matchesMagic(buffer: Buffer, magic: string[]): boolean {
  const head = buffer.subarray(0, 12).toString("hex");
  if (head.slice(8, 16) === "66747970") return true;
  return magic.some((signature) => head.startsWith(signature));
}
