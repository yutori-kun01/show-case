import { NextResponse, type NextRequest } from "next/server";

/**
 * 運営側の入口を実行時の環境変数だけで決める。
 * 秘匿パス（OPS_BASE_PATH）か秘匿ホスト（OPS_HOST）から来たものだけを
 * 内部セグメント /ops-internal へ書き換える。内部セグメントを直接叩いた場合は404。
 * URLを隠すのは補助にすぎないため、認証と許可リストは各ページ側で必ず見る。
 */
const INTERNAL_PREFIX = "/ops-internal";

function opsBasePath(): string {
  const raw = process.env.OPS_BASE_PATH ?? "ops";
  return `/${raw.replace(/^\/+|\/+$/g, "")}`;
}

function withNoIndex(response: NextResponse): NextResponse {
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  const opsHost = process.env.OPS_HOST?.toLowerCase();
  const basePath = opsBasePath();

  // 内部セグメントへの直接アクセスは存在しないものとして扱う。
  if (pathname === INTERNAL_PREFIX || pathname.startsWith(`${INTERNAL_PREFIX}/`)) {
    return new NextResponse(null, { status: 404 });
  }

  // 公開側だけをデプロイする構成では、運営側の入口そのものを置かない。
  const opsDisabled = process.env.OPS_DISABLED === "1" || process.env.OPS_DISABLED === "true";
  if (opsDisabled) return NextResponse.next();

  if (opsHost && host === opsHost) {
    const url = request.nextUrl.clone();
    url.pathname = `${INTERNAL_PREFIX}${pathname === "/" ? "" : pathname}`;
    return withNoIndex(NextResponse.rewrite(url));
  }

  if (pathname === basePath || pathname.startsWith(`${basePath}/`)) {
    // 秘匿ホストを指定している場合は、公開ホストからの秘匿パスを受け付けない。
    if (opsHost) return new NextResponse(null, { status: 404 });
    const url = request.nextUrl.clone();
    url.pathname = `${INTERNAL_PREFIX}${pathname.slice(basePath.length)}`;
    return withNoIndex(NextResponse.rewrite(url));
  }

  // 公開ホストで運営側のホスト名が設定されている場合、公開側はそのまま通す。
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
