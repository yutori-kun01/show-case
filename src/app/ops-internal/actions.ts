"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOpsSession } from "@/lib/auth";
import { db } from "@/lib/db";
import type { AccessMode, ListingStatus, MaskRuleKind } from "@/lib/db/types";
import { opsUrl } from "@/lib/opsPath";
import { EMPTY_SETUP_CONFIG } from "@/lib/pipeline/templates";
import { setRepoSelected, syncRepos } from "@/lib/services/repos";
import { createSnapshot, publishSnapshot } from "@/lib/services/snapshots";
import { MediaError, uploadMedia } from "@/lib/services/media";
import { addViewers, removeViewer, setViewerStatus, updateSiteSettings } from "@/lib/services/access";
import {
  parseDemoMedia,
  parseSetupConfig,
  parseTags,
  toSlug,
} from "@/lib/services/setupForm";

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "");
}

/** GitHubから取り込み直す。 */
export async function syncReposAction(): Promise<void> {
  const { creator } = await requireOpsSession();
  await syncRepos(creator);
  revalidatePath("/ops-internal/repos");
}

export async function toggleRepoAction(form: FormData): Promise<void> {
  await requireOpsSession();
  await setRepoSelected(field(form, "repo_id"), field(form, "selected") === "1");
  revalidatePath("/ops-internal/repos");
}

/** 選んだリポジトリから公開ページの下書きを作る。 */
export async function createListingAction(form: FormData): Promise<void> {
  const { creator } = await requireOpsSession();
  const repoId = field(form, "repo_id");
  const repo = await db().findOne("repos", { id: repoId, creator_id: creator.id });
  if (!repo) throw new Error("リポジトリが見つかりません");

  const title = field(form, "title").trim() || repo.full_name.split("/")[1];
  const slug = toSlug(field(form, "slug") || title);
  if (!slug) throw new Error("slugを入力してください");
  if (await db().findOne("listings", { slug })) throw new Error("そのslugはすでに使われています");

  const now = new Date().toISOString();
  const listing = await db().insert("listings", {
    creator_id: creator.id,
    repo_id: repo.id,
    slug,
    title,
    summary: "",
    description: "",
    tags: [],
    hero_image: null,
    demo_media: [],
    setup_config: EMPTY_SETUP_CONFIG,
    status: "draft",
    updated_at: now,
  });
  await setRepoSelected(repo.id, true);
  redirect(opsUrl(`/listings/${listing.id}`));
}

export async function saveListingAction(form: FormData): Promise<void> {
  const { creator } = await requireOpsSession();
  const id = field(form, "id");
  const listing = await db().findOne("listings", { id, creator_id: creator.id });
  if (!listing) throw new Error("公開ページが見つかりません");

  const slug = toSlug(field(form, "slug") || listing.slug);
  const duplicate = await db().findOne("listings", { slug });
  if (duplicate && duplicate.id !== listing.id) throw new Error("そのslugはすでに使われています");

  await db().update("listings", listing.id, {
    slug,
    title: field(form, "title").trim(),
    summary: field(form, "summary").trim(),
    description: field(form, "description").trim(),
    tags: parseTags(field(form, "tags")),
    hero_image: field(form, "hero_image").trim() || null,
    demo_media: parseDemoMedia(field(form, "demo_media")),
    setup_config: parseSetupConfig({
      requirements: field(form, "requirements"),
      setup: field(form, "setup"),
      start: field(form, "start"),
      open_url: field(form, "open_url"),
      env: field(form, "env"),
    }),
    updated_at: new Date().toISOString(),
  });
  revalidatePath("/ops-internal/listings");
}

export async function setListingStatusAction(form: FormData): Promise<void> {
  const { creator } = await requireOpsSession();
  const id = field(form, "id");
  const listing = await db().findOne("listings", { id, creator_id: creator.id });
  if (!listing) throw new Error("公開ページが見つかりません");
  await db().update("listings", listing.id, {
    status: field(form, "status") as ListingStatus,
    updated_at: new Date().toISOString(),
  });
  revalidatePath("/ops-internal/listings");
}

/** 画像・動画をアップロードしてURLを差し込む。 */
export async function uploadMediaAction(form: FormData): Promise<void> {
  const { creator } = await requireOpsSession();
  const id = field(form, "listing_id");
  const listing = await db().findOne("listings", { id, creator_id: creator.id });
  if (!listing) throw new Error("公開ページが見つかりません");

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("ファイルを選んでください");

  try {
    const media = await uploadMedia(file);
    if (field(form, "role") === "hero") {
      await db().update("listings", listing.id, { hero_image: media.url });
    } else {
      await db().update("listings", listing.id, {
        demo_media: [...listing.demo_media, { url: media.url, kind: media.kind }],
      });
    }
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new Error("アップロードに失敗しました");
  }
  revalidatePath(`/ops-internal/listings/${listing.id}`);
}

export async function addMaskRuleAction(form: FormData): Promise<void> {
  const { creator } = await requireOpsSession();
  const listingId = field(form, "listing_id");
  await db().insert("mask_rules", {
    creator_id: creator.id,
    listing_id: listingId || null,
    kind: field(form, "kind") as MaskRuleKind,
    pattern: field(form, "pattern").trim(),
    replacement: field(form, "replacement"),
  });
  revalidatePath("/ops-internal/mask");
  if (listingId) revalidatePath(`/ops-internal/listings/${listingId}`);
}

export async function deleteMaskRuleAction(form: FormData): Promise<void> {
  const { creator } = await requireOpsSession();
  const rule = await db().findOne("mask_rules", { id: field(form, "id"), creator_id: creator.id });
  if (rule) await db().remove("mask_rules", rule.id);
  revalidatePath("/ops-internal/mask");
}

/** ZIPを作る。検出があれば status は blocked のままになり、公開できない。 */
export async function generateSnapshotAction(form: FormData): Promise<void> {
  const { creator } = await requireOpsSession();
  const id = field(form, "listing_id");
  const listing = await db().findOne("listings", { id, creator_id: creator.id });
  if (!listing) throw new Error("公開ページが見つかりません");
  await createSnapshot(listing.id);
  revalidatePath(`/ops-internal/listings/${listing.id}`);
}

/** 検出結果を確認したうえで公開する。push後の自動再公開はしない。 */
export async function publishSnapshotAction(form: FormData): Promise<void> {
  await requireOpsSession();
  const snapshot = await publishSnapshot(field(form, "snapshot_id"));
  revalidatePath(`/ops-internal/listings/${snapshot.listing_id}`);
}

export async function closeReportAction(form: FormData): Promise<void> {
  await requireOpsSession();
  await db().update("reports", field(form, "id"), { status: "closed" });
  revalidatePath("/ops-internal/reports");
}

const ACCESS_MODES: AccessMode[] = ["open", "register", "allowlist"];

/** 公開側の閲覧制限の設定を保存する。 */
export async function saveAccessSettingsAction(form: FormData): Promise<void> {
  const { creator } = await requireOpsSession();
  const mode = field(form, "access_mode") as AccessMode;
  if (!ACCESS_MODES.includes(mode)) throw new Error("閲覧制限の設定が正しくありません");
  await updateSiteSettings(creator, { access_mode: mode, verify_email: field(form, "verify_email") === "1" });
  revalidatePath("/ops-internal/viewers");
}

/** メールアドレスをまとめて登録する。結果は件数だけをURLに載せて表示する。 */
export async function addViewersAction(form: FormData): Promise<void> {
  const { creator } = await requireOpsSession();
  const result = await addViewers(creator, field(form, "emails"), field(form, "note"));
  const params = new URLSearchParams({
    added: String(result.added.length),
    existing: String(result.existing.length),
    invalid: String(result.invalid.length),
  });
  revalidatePath("/ops-internal/viewers");
  redirect(opsUrl(`/viewers?${params.toString()}`));
}

export async function setViewerStatusAction(form: FormData): Promise<void> {
  const { creator } = await requireOpsSession();
  await setViewerStatus(creator, field(form, "id"), field(form, "status") === "blocked" ? "blocked" : "active");
  revalidatePath("/ops-internal/viewers");
}

export async function removeViewerAction(form: FormData): Promise<void> {
  const { creator } = await requireOpsSession();
  await removeViewer(creator, field(form, "id"));
  revalidatePath("/ops-internal/viewers");
}
