import { requireOpsSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { OpsNav } from "../OpsNav";
import { closeReportAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await requireOpsSession();
  const reports = (await db().select("reports")).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const listings = await db().select("listings");
  const slugById = new Map(listings.map((listing) => [listing.id, listing.slug]));

  return (
    <main className="container">
      <OpsNav current="/reports" />
      <h1>通報</h1>

      {reports.length === 0 ? (
        <div className="panel">
          <p className="muted">通報はありません。</p>
        </div>
      ) : (
        reports.map((report) => (
          <div className="panel" key={report.id}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{report.reason}</strong>
              <span className="status">{report.status === "open" ? "未対応" : "対応済み"}</span>
            </div>
            <p className="small muted" style={{ margin: "6px 0" }}>
              <code>/r/{slugById.get(report.listing_id) ?? "?"}</code> ／{" "}
              {new Date(report.created_at).toLocaleString("ja-JP")}
            </p>
            <p style={{ whiteSpace: "pre-wrap" }}>{report.body}</p>
            {report.status === "open" && (
              <form action={closeReportAction}>
                <input type="hidden" name="id" value={report.id} />
                <button type="submit" className="secondary">
                  対応済みにする
                </button>
              </form>
            )}
          </div>
        ))
      )}
    </main>
  );
}
