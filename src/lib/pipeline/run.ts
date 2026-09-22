import type { ScanFinding, ScanReport, SetupConfig } from "@/lib/db/types";
import { shouldExclude, isTextFile } from "./exclude";
import { applyReplacements, stripGithubReferences, stripPackageJsonIdentity, type ReplaceRule } from "./replace";
import { DEFAULT_NG_WORDS, scanNgWords, scanSecrets, shouldBlockPublish } from "./scan";
import { renderTemplates } from "./templates";
import type { RepoFile } from "./tarball";
import { buildZip } from "./zip";

export interface PipelineInput {
  /** ZIPのルートフォルダ名に使う公開slug。 */
  slug: string;
  title: string;
  setupConfig: SetupConfig;
  files: RepoFile[];
  excludePatterns: string[];
  replaceRules: ReplaceRule[];
  ngWords: string[];
}

export interface PipelineOutput {
  zip: Buffer;
  report: ScanReport;
  /** 検出があれば公開しない。 */
  blocked: boolean;
  entries: { path: string; content: Buffer; mode?: number }[];
}

/**
 * 取得済みのファイル一覧から、除外・置換・検査・テンプレート同梱・ZIP化までを行う。
 * ストレージやDBには触れないので、そのままテストできる。
 */
export async function runPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const excluded: string[] = [];
  const findings: ScanFinding[] = [];
  const replacementCounts = new Map<string, number>();
  const kept: { path: string; content: Buffer; mode?: number }[] = [];
  const ngWords = input.ngWords.length > 0 ? input.ngWords : DEFAULT_NG_WORDS;

  for (const file of input.files) {
    // 2. 除外
    const decision = shouldExclude(file.path, file.content, input.excludePatterns);
    if (decision.excluded) {
      excluded.push(`${file.path} (${decision.reason})`);
      continue;
    }

    if (!isTextFile(file.path, file.content)) {
      kept.push({ path: file.path, content: file.content, mode: file.mode });
      continue;
    }

    // 3. 置換（テキストファイルのみ）
    let text = file.content.toString("utf8");
    const result = applyReplacements(text, input.replaceRules);
    text = result.text;
    for (const { pattern, count } of result.counts) {
      replacementCounts.set(pattern, (replacementCounts.get(pattern) ?? 0) + count);
    }

    if (file.path === "package.json" || file.path.endsWith("/package.json")) {
      const stripped = stripPackageJsonIdentity(text);
      text = stripped.text;
      for (const key of stripped.removed) {
        replacementCounts.set(`package.json:${key}`, (replacementCounts.get(`package.json:${key}`) ?? 0) + 1);
      }
    }

    if (/(^|\/)README(\.[^/]*)?$/i.test(file.path)) {
      const stripped = stripGithubReferences(text);
      text = stripped.text;
      if (stripped.count > 0) {
        replacementCounts.set("readme:github", (replacementCounts.get("readme:github") ?? 0) + stripped.count);
      }
    }

    // 4. 検査（置換後のテキストに対して行う）
    findings.push(...scanSecrets(file.path, text));
    findings.push(...scanNgWords(file.path, text, ngWords));

    kept.push({ path: file.path, content: Buffer.from(text, "utf8"), mode: file.mode });
  }

  // 5. 同梱（生成したテンプレートは検査済みの自前の内容なので上書きする）
  const templates = renderTemplates(input.title, input.setupConfig);
  const templatePaths = new Set(templates.map((template) => template.path));
  const entries = [
    ...kept.filter((entry) => !templatePaths.has(entry.path)),
    ...templates.map((template) => ({
      path: template.path,
      content: Buffer.from(template.content, "utf8"),
      mode: template.mode,
    })),
  ];

  // 6. 保存用のZIP（ルートは公開slug）
  const zip = await buildZip(input.slug, entries);

  const report: ScanReport = {
    replacements: [...replacementCounts.entries()].map(([pattern, count]) => ({ pattern, count })),
    excluded_paths: excluded,
    findings,
    file_count: entries.length,
    bytes: zip.byteLength,
  };

  return { zip, report, blocked: shouldBlockPublish(findings), entries };
}
