import Link from "next/link";
import { requireOpsSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { opsUrl } from "@/lib/opsPath";
import { OpsNav } from "../OpsNav";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  published: "公開",
  unlisted: "非公開",
};

export default async function ListingsPage() {
  const { creator } = await requireOpsSession();
  const listings = await db().select("listings", { creator_id: creator.id });
  const snapshots = await db().select("snapshots");

  return (
    <main className="container">
      <OpsNav current="/listings" />
      <h1>公開ページ</h1>

      {listings.length === 0 ? (
        <div className="panel">
          <p className="muted">
            まだありません。<Link href={opsUrl("/repos")}>リポジトリ</Link>から下書きを作ってください。
          </p>
        </div>
      ) : (
        <div className="panel">
          <table>
            <thead>
              <tr>
                <th>タイトル</th>
                <th>slug</th>
                <th>状態</th>
                <th>公開中の版</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => {
                const published = snapshots.find(
                  (snapshot) => snapshot.listing_id === listing.id && snapshot.status === "published",
                );
                return (
                  <tr key={listing.id}>
                    <td>
                      <Link href={opsUrl(`/listings/${listing.id}`)}>{listing.title || "(無題)"}</Link>
                    </td>
                    <td>
                      <code>{listing.slug}</code>
                    </td>
                    <td>
                      <span className={`status ${listing.status}`}>{STATUS_LABEL[listing.status]}</span>
                    </td>
                    <td>{published ? `第${published.version}版` : "なし"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
