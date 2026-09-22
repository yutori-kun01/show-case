import { db } from "@/lib/db";
import type { Creator, MaskRule } from "@/lib/db/types";
import { DEFAULT_NG_WORDS } from "@/lib/pipeline/scan";
import type { ReplaceRule } from "@/lib/pipeline/replace";

export interface ResolvedMask {
  excludePatterns: string[];
  replaceRules: ReplaceRule[];
  ngWords: string[];
}

/**
 * 全体共通（listing_id が NULL）とリポジトリ個別の2層を合成する。
 * 出品者のGitHubユーザー名とメールアドレスは、既定の置換ルールとして必ず入れる。
 */
export async function resolveMaskRules(creator: Creator, listingId: string): Promise<ResolvedMask> {
  const rules = await db().select("mask_rules", { creator_id: creator.id });
  const applicable = rules.filter(
    (rule: MaskRule) => rule.listing_id === null || rule.listing_id === listingId,
  );

  const replaceRules: ReplaceRule[] = [];
  if (creator.github_login) {
    replaceRules.push({ pattern: creator.github_login, replacement: creator.display_name });
  }

  return {
    excludePatterns: applicable.filter((rule) => rule.kind === "exclude").map((rule) => rule.pattern),
    replaceRules: [
      ...replaceRules,
      ...applicable
        .filter((rule) => rule.kind === "replace")
        .map((rule) => ({ pattern: rule.pattern, replacement: rule.replacement })),
    ],
    ngWords: [
      ...DEFAULT_NG_WORDS,
      ...(creator.github_login ? [creator.github_login] : []),
      ...applicable.filter((rule) => rule.kind === "ngword").map((rule) => rule.pattern),
    ],
  };
}
