import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 死活確認。DBに軽い問い合わせをするので、Supabase 無料プランの
 * 「7日間アクセスがないと一時停止」を定期アクセスで避けるのにも使う。
 */
export async function GET(): Promise<NextResponse> {
  try {
    await db().count("site_settings");
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
