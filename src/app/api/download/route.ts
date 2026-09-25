import { NextResponse } from "next/server";
import { z } from "zod";
import { currentViewerAccess } from "@/lib/auth/viewer";
import { DownloadError, requestDownload } from "@/lib/services/downloads";

export const runtime = "nodejs";

const schema = z.object({
  slug: z.string().min(1),
  email: z.string().email().optional(),
  consent_newsletter: z.boolean().default(false),
});

export async function POST(request: Request): Promise<NextResponse> {
  const access = await currentViewerAccess();
  if (!access.allowed) {
    return NextResponse.json({ message: "ログインしてください" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  // 閲覧制限中はログインしたメールアドレスで記録する。誰でも見られる設定のときだけ入力を使う。
  const email = access.viewer?.email ?? parsed.data?.email;
  if (!parsed.success || !email) {
    return NextResponse.json({ message: "入力内容を確認してください" }, { status: 400 });
  }

  try {
    const grant = await requestDownload({
      slug: parsed.data.slug,
      email,
      consentNewsletter: parsed.data.consent_newsletter,
    });
    return NextResponse.json(grant, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DownloadError) {
      return NextResponse.json({ message: error.message }, { status: 429 });
    }
    console.error("[download]", error);
    return NextResponse.json({ message: "ダウンロードの準備に失敗しました" }, { status: 500 });
  }
}
