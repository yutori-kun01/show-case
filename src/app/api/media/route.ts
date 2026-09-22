import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { storage } from "@/lib/storage";
import { extensionOf } from "@/lib/pipeline/exclude";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
};

/** ローカルストレージのときだけ使う、画像・動画の配信口。 */
export async function GET(request: Request): Promise<NextResponse> {
  if (env.storageDriver !== "local") {
    return NextResponse.json({ message: "この配信口は使われていません" }, { status: 404 });
  }
  const key = new URL(request.url).searchParams.get("key") ?? "";
  const contentType = CONTENT_TYPES[extensionOf(key)];
  // 登録済みの形式以外は配信しない（SVGなどスクリプトを埋め込めるものを避ける）。
  if (!key.startsWith("media/") || !contentType) {
    return NextResponse.json({ message: "見つかりません" }, { status: 404 });
  }
  try {
    const body = await storage().get(key);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "content-type": contentType,
        "content-length": String(body.byteLength),
        "cache-control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ message: "見つかりません" }, { status: 404 });
  }
}
