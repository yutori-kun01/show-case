import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isAllowedEmail } from "@/lib/auth";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth/session";
import { currentViewerAccess } from "@/lib/auth/viewer";
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

/** 画像・動画の署名付きURLの有効期間。ページを開いている間に切れないよう長めにする。 */
const MEDIA_URL_TTL_SECONDS = 60 * 60;

/**
 * 画像・動画の配信口。ローカルは中身を返し、Supabase Storage は署名付きURLへ転送する。
 * R2 は公開URLを直接使うため、ここは通らない。閲覧制限中はログインした人（と運営）だけに返す。
 */
export async function GET(request: Request): Promise<NextResponse> {
  const driver = env.storageDriver;
  if (driver === "r2") {
    return NextResponse.json({ message: "この配信口は使われていません" }, { status: 404 });
  }
  const key = new URL(request.url).searchParams.get("key") ?? "";
  const contentType = CONTENT_TYPES[extensionOf(key)];
  // 登録済みの形式以外は配信しない（SVGなどスクリプトを埋め込めるものを避ける）。
  if (!key.startsWith("media/") || key.includes("..") || !contentType) {
    return NextResponse.json({ message: "見つかりません" }, { status: 404 });
  }

  if (!(await mayViewMedia())) {
    return NextResponse.json({ message: "ログインしてください" }, { status: 401 });
  }

  try {
    if (driver === "supabase") {
      const url = await storage().signedUrl(key, MEDIA_URL_TTL_SECONDS);
      return NextResponse.redirect(url, { status: 302, headers: { "cache-control": "private, max-age=600" } });
    }
    const body = await storage().get(key);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "content-type": contentType,
        "content-length": String(body.byteLength),
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ message: "見つかりません" }, { status: 404 });
  }
}

async function mayViewMedia(): Promise<boolean> {
  if ((await currentViewerAccess()).allowed) return true;
  // 運営側の編集画面のプレビューでも表示できるようにする。
  const session = readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  return Boolean(session && isAllowedEmail(session.email));
}
