import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { storage } from "@/lib/storage";
import { publishedSnapshot } from "./snapshots";
import { getPublishedListing } from "./publicView";

export interface DownloadRequest {
  slug: string;
  email: string;
  consentNewsletter: boolean;
}

export interface DownloadGrant {
  url: string;
  fileName: string;
  expiresInSeconds: number;
}

export class DownloadError extends Error {}

/**
 * ダウンロードの手前に挟む権限チェックの層。
 * フェーズ1は回数制限だけを見るが、ここに後から課金の判定を足せる。
 */
export async function checkEntitlement(email: string): Promise<{ allowed: boolean; reason?: string }> {
  const since = Date.now() - 60 * 60 * 1000;
  const history = await db().select("downloads", { email });
  const recent = history.filter((row) => Date.parse(row.created_at) >= since);
  if (recent.length >= env.downloadRateLimitPerHour) {
    return { allowed: false, reason: "短時間のダウンロードが多すぎます。しばらく待ってからお試しください" };
  }
  return { allowed: true };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** メール登録を記録し、有効期限付きの署名付きURLを返す。 */
export async function requestDownload(request: DownloadRequest): Promise<DownloadGrant> {
  const email = request.email.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new DownloadError("メールアドレスの形式が正しくありません");

  const listing = await getPublishedListing(request.slug);
  if (!listing) throw new DownloadError("公開されていません");

  const snapshot = await publishedSnapshot(listing);
  if (!snapshot?.zip_path) throw new DownloadError("配布できる版がまだありません");

  const entitlement = await checkEntitlement(email);
  if (!entitlement.allowed) throw new DownloadError(entitlement.reason ?? "ダウンロードできません");

  await db().insert("downloads", {
    snapshot_id: snapshot.id,
    email,
    consent_newsletter: request.consentNewsletter,
  });

  const fileName = `${listing.slug}-v${snapshot.version}.zip`;
  const url = await storage().signedUrl(snapshot.zip_path, env.downloadUrlTtlSeconds, fileName);
  return { url, fileName, expiresInSeconds: env.downloadUrlTtlSeconds };
}
