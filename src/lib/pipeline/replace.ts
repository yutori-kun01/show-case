/** 置換ルールの適用（仕様書「マスク・ZIP生成パイプライン」3. 置換）。 */

export interface ReplaceRule {
  /** 文字列か `/正規表現/フラグ` 形式。 */
  pattern: string;
  replacement: string;
}

export interface ReplaceResult {
  text: string;
  counts: { pattern: string; count: number }[];
}

/** `/.../gi` 形式なら正規表現、それ以外は文字列として扱う。 */
export function toRegExp(pattern: string): RegExp {
  const match = /^\/(.*)\/([gimsuy]*)$/s.exec(pattern);
  if (match) {
    const flags = match[2].includes("g") ? match[2] : `${match[2]}g`;
    return new RegExp(match[1], flags);
  }
  return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
}

export function applyReplacements(text: string, rules: ReplaceRule[]): ReplaceResult {
  let output = text;
  const counts: { pattern: string; count: number }[] = [];
  for (const rule of rules) {
    const regex = toRegExp(rule.pattern);
    let count = 0;
    output = output.replace(regex, () => {
      count += 1;
      return rule.replacement;
    });
    if (count > 0) counts.push({ pattern: rule.pattern, count });
  }
  return { text: output, counts };
}

/** package.json から author・repository・bugs・homepage を取り除く。 */
export function stripPackageJsonIdentity(text: string): { text: string; removed: string[] } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { text, removed: [] };
  }
  const removed: string[] = [];
  for (const key of ["author", "contributors", "repository", "bugs", "homepage", "funding"]) {
    if (key in parsed) {
      delete parsed[key];
      removed.push(key);
    }
  }
  if (removed.length === 0) return { text, removed };
  const endsWithNewline = text.endsWith("\n");
  return { text: JSON.stringify(parsed, null, 2) + (endsWithNewline ? "\n" : ""), removed };
}

const BADGE = /^[ \t]*\[!\[[^\]]*\]\([^)]*\)\]\([^)]*github\.com[^)]*\)[ \t]*$/gim;
const BADGE_IMAGE = /^[ \t]*!\[[^\]]*\]\((?:https?:\/\/)?(?:img\.shields\.io|github\.com)[^)]*\)[ \t]*$/gim;
const INLINE_GITHUB_LINK = /\[([^\]]+)\]\((?:https?:\/\/)?(?:www\.)?github\.com\/[^)]*\)/gi;
// 置換後にユーザー名が英数字以外になっていることもあるため、パス部分は広めに取る。
const BARE_GITHUB_URL = /(?:https?:\/\/)?(?:www\.)?github\.com(?:\/[^\s)"'\]]*)?/gi;

/** README からGitHubのバッジとリンクを取り除く。リンクは文言だけ残す。 */
export function stripGithubReferences(text: string): { text: string; count: number } {
  let count = 0;
  const bump = (replacement: string) => {
    count += 1;
    return replacement;
  };
  const output = text
    .replace(BADGE, () => bump(""))
    .replace(BADGE_IMAGE, () => bump(""))
    .replace(INLINE_GITHUB_LINK, (_match, label: string) => bump(label))
    .replace(BARE_GITHUB_URL, () => bump(""))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n");
  return { text: output, count };
}
