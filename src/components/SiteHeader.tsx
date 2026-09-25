import Link from "next/link";
import { viewerSignOutAction } from "@/app/access/actions";

/** 公開側の共通ヘッダー。運営側へのリンクは置かない。 */
export function SiteHeader({ viewerEmail }: { viewerEmail?: string | null }) {
  return (
    <header className="site-header">
      <div className="inner">
        <Link href="/">リポジトリショーケース</Link>
        {viewerEmail ? (
          <form action={viewerSignOutAction} className="row small" style={{ gap: 8 }}>
            <span className="muted">{viewerEmail}</span>
            <button type="submit" className="link">
              ログアウト
            </button>
          </form>
        ) : (
          <span className="tagline">自作ツールを、そのまま持ち帰れる形で。</span>
        )}
      </div>
    </header>
  );
}
