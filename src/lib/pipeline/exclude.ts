/** 除外パスと種別の判定（仕様書「マスク・ZIP生成パイプライン」2. 除外）。 */

export const DEFAULT_EXCLUDES = [
  ".git/",
  ".github/",
  ".claude/",
  ".cursor/",
  ".devcontainer/",
  "CLAUDE.md",
  "AGENTS.md",
  ".env",
  ".env.*",
  "node_modules/",
  ".DS_Store",
] as const;

/** `.env.*` に一致しても残すもの。 */
const KEEP_FILENAMES = [".env.example", ".env.sample", ".env.template"];

/** 実行ファイル・アーカイブ。中身を確認できないため取り除く。 */
const EXECUTABLE_EXTENSIONS = new Set([
  "exe", "dll", "so", "dylib", "bin", "o", "a", "class", "jar", "wasm", "msi", "apk", "dmg", "pyc",
  "zip", "gz", "tgz", "bz2", "xz", "7z", "rar", "sqlite", "db",
]);

/** 画像・フォント・音声など、アプリの動作に必要なので残すがテキスト置換はしない。 */
const ASSET_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "avif", "bmp",
  "woff", "woff2", "ttf", "otf", "eot",
  "mp4", "mov", "webm", "mp3", "wav", "ogg", "pdf",
]);

/** パターンをパスに当てる。末尾 `/` はディレクトリ、`*` は1階層内のワイルドカード。 */
export function matchesPattern(filePath: string, pattern: string): boolean {
  const normalized = filePath.replace(/^\.\//, "");
  if (pattern.endsWith("/")) {
    const dir = pattern.slice(0, -1);
    return normalized === dir || normalized.startsWith(`${dir}/`) || normalized.includes(`/${dir}/`);
  }
  const regex = new RegExp(
    `^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`,
  );
  // パターンにスラッシュがあればパス全体、なければ任意の階層のファイル名に当てる。
  return pattern.includes("/")
    ? regex.test(normalized)
    : normalized.split("/").some((segment) => regex.test(segment));
}

export interface ExcludeDecision {
  excluded: boolean;
  reason?: string;
}

export function shouldExclude(
  filePath: string,
  content: Buffer,
  extraPatterns: string[] = [],
): ExcludeDecision {
  const name = filePath.split("/").pop() ?? filePath;
  if (!KEEP_FILENAMES.includes(name)) {
    for (const pattern of [...DEFAULT_EXCLUDES, ...extraPatterns]) {
      if (matchesPattern(filePath, pattern)) return { excluded: true, reason: pattern };
    }
  }
  if (isExecutable(filePath, content)) return { excluded: true, reason: "実行ファイル・バイナリ" };
  return { excluded: false };
}

export function extensionOf(filePath: string): string {
  const name = filePath.split("/").pop() ?? "";
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(index + 1).toLowerCase() : "";
}

/** 実行ファイル・アーカイブの判定。拡張子と先頭バイトの署名で見る。 */
export function isExecutable(filePath: string, content: Buffer): boolean {
  if (EXECUTABLE_EXTENSIONS.has(extensionOf(filePath))) return true;
  const head = content.subarray(0, 4);
  const magic = head.toString("hex");
  return (
    ["7f454c46", "cffaedfe", "cefaedfe", "feedface"].includes(magic) ||
    content.subarray(0, 2).toString("latin1") === "MZ"
  );
}

/** 置換と検査の対象にできるテキストファイルかどうか。 */
export function isTextFile(filePath: string, content: Buffer): boolean {
  if (ASSET_EXTENSIONS.has(extensionOf(filePath))) return false;
  if (isExecutable(filePath, content)) return false;
  return !content.subarray(0, 8000).includes(0);
}
