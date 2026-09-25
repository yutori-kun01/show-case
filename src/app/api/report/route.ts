import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentViewerAccess } from "@/lib/auth/viewer";

export const runtime = "nodejs";

const schema = z.object({
  slug: z.string().min(1),
  reason: z.string().min(1).max(100),
  body: z.string().min(1).max(4000),
});

export async function POST(request: Request): Promise<NextResponse> {
  if (!(await currentViewerAccess()).allowed) {
    return NextResponse.json({ message: "ログインしてください" }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "入力内容を確認してください" }, { status: 400 });
  }

  const listing = await db().findOne("listings", { slug: parsed.data.slug });
  if (!listing) return NextResponse.json({ message: "対象が見つかりません" }, { status: 404 });

  await db().insert("reports", {
    listing_id: listing.id,
    reason: parsed.data.reason,
    body: parsed.data.body,
    status: "open",
  });
  return NextResponse.json({ ok: true });
}
