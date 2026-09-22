import { describe, expect, it } from "vitest";
import { LocalGithub } from "@/lib/github/local";
import { extractTarball } from "@/lib/pipeline/tarball";
import { runPipeline } from "@/lib/pipeline/run";
import { DEFAULT_NG_WORDS } from "@/lib/pipeline/scan";
import type { SetupConfig } from "@/lib/db/types";
import { readZip } from "./helpers/zip";

const setupConfig: SetupConfig = {
  requirements: ["Node.js 20以上"],
  setup: "npm install",
  start: "npm run dev",
  open_url: "http://localhost:3000",
  env: [{ key: "PORT", required: false, description: "ポート番号", how_to_get: "" }],
};

async function buildFixtureSnapshot() {
  const github = new LocalGithub("fixtures/repos");
  const sha = await github.headCommit("sample-owner/todo-tool");
  const files = await extractTarball(await github.tarball("sample-owner/todo-tool", sha));
  const result = await runPipeline({
    slug: "todo-tool",
    title: "Todo Tool",
    setupConfig,
    files,
    excludePatterns: [],
    replaceRules: [{ pattern: "sample-owner", replacement: "運営" }],
    ngWords: [...DEFAULT_NG_WORDS, "sample-owner"],
  });
  return { result, entries: await readZip(result.zip) };
}

describe("パイプライン全体", () => {
  it("ルートフォルダ名を公開slugにする", async () => {
    const { entries } = await buildFixtureSnapshot();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.path.startsWith("todo-tool/")).toBe(true);
      expect(entry.path).not.toContain("sample-owner-todo-tool-");
    }
  });

  it("AIの痕跡と .env を取り除く", async () => {
    const { entries, result } = await buildFixtureSnapshot();
    const paths = entries.map((entry) => entry.path);
    expect(paths).not.toContain("todo-tool/CLAUDE.md");
    expect(paths).not.toContain("todo-tool/.claude/settings.json");
    expect(paths).not.toContain("todo-tool/.env");
    expect(paths).toContain("todo-tool/.env.example");
    expect(result.report.excluded_paths.join(" ")).toContain("CLAUDE.md");
  });

  it("ユーザー名を置き換え、package.json の author などを消す", async () => {
    const { entries } = await buildFixtureSnapshot();
    const joined = entries.map((entry) => entry.content).join("\n");
    expect(joined).not.toContain("sample-owner");
    const packageJson = entries.find((entry) => entry.path === "todo-tool/package.json");
    const parsed = JSON.parse(packageJson!.content) as Record<string, unknown>;
    expect(parsed.author).toBeUndefined();
    expect(parsed.repository).toBeUndefined();
    expect(parsed.bugs).toBeUndefined();
    expect(parsed.homepage).toBeUndefined();
  });

  it("README からGitHubのバッジとリンクを消す", async () => {
    const { entries } = await buildFixtureSnapshot();
    const readme = entries.find((entry) => entry.path === "todo-tool/README.md");
    expect(readme?.content).not.toContain("github.com");
    expect(readme?.content).not.toContain("img.shields.io");
  });

  it("セットアップテンプレートを同梱する", async () => {
    const { entries } = await buildFixtureSnapshot();
    const paths = entries.map((entry) => entry.path);
    for (const name of ["SETUP.md", ".env.example", "setup.sh", "setup.ps1", "AI_SETUP_PROMPT.md"]) {
      expect(paths).toContain(`todo-tool/${name}`);
    }
    const generated = entries.find((entry) => entry.path === "todo-tool/.env.example");
    // 元リポジトリの .env.example ではなく、設定から生成したものが入る。
    expect(generated?.content).toContain("# ポート番号");
  });

  it("検出がなければ公開できる状態になる", async () => {
    const { result } = await buildFixtureSnapshot();
    expect(result.report.findings).toEqual([]);
    expect(result.blocked).toBe(false);
  });

  it("シークレットが残っていれば公開を止める", async () => {
    const result = await runPipeline({
      slug: "leaky",
      title: "Leaky",
      setupConfig,
      files: [
        {
          path: "src/config.ts",
          content: Buffer.from('export const key = "AKIAIOSFODNN7EXAMPLE";'),
          mode: 0o644,
        },
      ],
      excludePatterns: [],
      replaceRules: [],
      ngWords: DEFAULT_NG_WORDS,
    });
    expect(result.blocked).toBe(true);
    expect(result.report.findings[0].rule).toBe("aws-access-key");
  });

  it("同じ内容なら同じZIPになる", async () => {
    const [first, second] = [await buildFixtureSnapshot(), await buildFixtureSnapshot()];
    expect(first.result.zip.equals(second.result.zip)).toBe(true);
  });
});
