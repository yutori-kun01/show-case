import { db } from "@/lib/db";
import type { Listing, PublicListing, PublicSnapshot, Snapshot } from "@/lib/db/types";

/**
 * 公開側に返す形へ絞る。`creators.github_login`、`repos.full_name`、`commit_sha` は含めない。
 */
export function toPublicListing(listing: Listing): PublicListing {
  return {
    slug: listing.slug,
    title: listing.title,
    summary: listing.summary,
    description: listing.description,
    tags: listing.tags,
    hero_image: listing.hero_image,
    demo_media: listing.demo_media,
    requirements: listing.setup_config.requirements,
    setup: listing.setup_config.setup,
    start: listing.setup_config.start,
    open_url: listing.setup_config.open_url,
    env_keys: listing.setup_config.env.map((item) => ({
      key: item.key,
      required: item.required,
      description: item.description,
      how_to_get: item.how_to_get,
    })),
    updated_at: listing.updated_at,
  };
}

export function toPublicSnapshot(snapshot: Snapshot): PublicSnapshot {
  return {
    id: snapshot.id,
    version: snapshot.version,
    zip_bytes: snapshot.zip_bytes,
    created_at: snapshot.created_at,
  };
}

/** 一覧。公開中のものだけを新しい順に返す。 */
export async function listPublicListings(): Promise<PublicListing[]> {
  const listings = await db().select("listings", { status: "published" });
  return listings
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map(toPublicListing);
}

export async function getPublishedListing(slug: string): Promise<Listing | null> {
  return db().findOne("listings", { slug, status: "published" });
}
