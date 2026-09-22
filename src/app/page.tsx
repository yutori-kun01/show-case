import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { listPublicListings } from "@/lib/services/publicView";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const listings = await listPublicListings();

  return (
    <>
      <SiteHeader />
      <main className="container">
        <h1>公開中のツール</h1>
        <p className="lead">
          ダウンロードしたフォルダには、セットアップ手順とAIエディター用のプロンプトが同梱されています。
        </p>

        {listings.length === 0 ? (
          <div className="panel">
            <p className="muted">まだ公開されているツールはありません。</p>
          </div>
        ) : (
          <div className="grid">
            {listings.map((listing) => (
              <Link key={listing.slug} href={`/r/${listing.slug}`} className="card">
                {listing.hero_image ? (
                  // 外部ストレージの画像をそのまま表示する。
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="hero" src={listing.hero_image} alt="" />
                ) : (
                  <div className="hero" />
                )}
                <div className="body">
                  <h3>{listing.title}</h3>
                  <p>{listing.summary}</p>
                  <div className="tags">
                    {listing.tags.map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
