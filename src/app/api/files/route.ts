import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { storage } from "@/lib/storage";
import { verify } from "@/lib/storage/signing";

export const runtime = "nodejs";

/**
 * ローカルストレージ用の配信口。R2 を使う場合は R2 の署名付きURLに直接飛ぶため通らない。
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (env.storageDriver !== "local") {
    return NextResponse.json({ message: "この配信口は使われていません" }, { status: 404 });
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "";
  const expiresAt = Number(url.searchParams.get("exp"));
  const signature = url.searchParams.get("sig") ?? "";
  const name = url.searchParams.get("name") ?? key.split("/").pop() ?? "download.zip";

  if (!key || !verify(key, expiresAt, signature)) {
    return NextResponse.json({ message: "リンクの有効期限が切れています" }, { status: 403 });
  }

  try {
    const body = await storage().get(key);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "content-type": "application/zip",
        "content-length": String(body.byteLength),
        "content-disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ message: "ファイルが見つかりません" }, { status: 404 });
  }
}
