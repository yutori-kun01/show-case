import { NextResponse } from "next/server";
import { z } from "zod";
import { DownloadError, requestDownload } from "@/lib/services/downloads";

export const runtime = "nodejs";

const schema = z.object({
  slug: z.string().min(1),
  email: z.string().email(),
  consent_newsletter: z.boolean().default(false),
});

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "入力内容を確認してください" }, { status: 400 });
  }

  try {
    const grant = await requestDownload({
      slug: parsed.data.slug,
      email: parsed.data.email,
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
