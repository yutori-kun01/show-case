import Link from "next/link";

/** 公開側の共通ヘッダー。運営側へのリンクは置かない。 */
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="inner">
        <Link href="/">リポジトリショーケース</Link>
        <span className="tagline">自作ツールを、そのまま持ち帰れる形で。</span>
      </div>
    </header>
  );
}
