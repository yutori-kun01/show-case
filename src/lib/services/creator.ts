import { db } from "@/lib/db";
import type { Creator } from "@/lib/db/types";
import { env } from "@/lib/env";

/** フェーズ1は出品者1人。なければ作る。 */
export async function siteCreator(): Promise<Creator> {
  const existing = (await db().select("creators"))[0];
  if (existing) return existing;
  return db().insert("creators", {
    display_name: env.optional("CREATOR_DISPLAY_NAME") ?? "運営",
    github_login: env.optional("CREATOR_GITHUB_LOGIN") ?? null,
    github_installation_id: env.optional("GITHUB_INSTALLATION_ID") ?? null,
  });
}
