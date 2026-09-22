import { describe, expect, it } from "vitest";
import { isExecutable, isTextFile, matchesPattern, shouldExclude } from "@/lib/pipeline/exclude";

const text = (value: string) => Buffer.from(value, "utf8");

describe("matchesPattern", () => {
  it("ディレクトリ指定は配下すべてに当たる", () => {
    expect(matchesPattern(".claude/settings.json", ".claude/")).toBe(true);
    expect(matchesPattern("packages/app/.claude/x.json", ".claude/")).toBe(true);
    expect(matchesPattern("docs/claude.md", ".claude/")).toBe(false);
  });

  it("ワイルドカードは1階層内だけに当たる", () => {
    expect(matchesPattern(".env.local", ".env.*")).toBe(true);
    expect(matchesPattern("config/.env.production", ".env.*")).toBe(true);
    expect(matchesPattern("env.local", ".env.*")).toBe(false);
  });
});

describe("shouldExclude", () => {
  it("既定の除外対象を取り除く", () => {
    for (const path of [".github/workflows/ci.yml", "CLAUDE.md", "AGENTS.md", ".env", ".cursor/rules", "node_modules/x/index.js"]) {
      expect(shouldExclude(path, text("x")).excluded, path).toBe(true);
    }
  });

  it(".env.example は残す", () => {
    expect(shouldExclude(".env.example", text("KEY=")).excluded).toBe(false);
  });

  it("追加の除外パターンも効く", () => {
    expect(shouldExclude("docs/secret.md", text("x"), ["docs/"]).excluded).toBe(true);
  });

  it("実行ファイルを取り除く", () => {
    expect(shouldExclude("bin/tool", Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02])).excluded).toBe(true);
    expect(shouldExclude("app.exe", text("x")).excluded).toBe(true);
  });

  it("画像は残す", () => {
    expect(shouldExclude("public/logo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47])).excluded).toBe(false);
  });
});

describe("isTextFile", () => {
  it("画像とバイナリは置換の対象にしない", () => {
    expect(isTextFile("public/logo.png", Buffer.from([0x89, 0x50]))).toBe(false);
    expect(isTextFile("src/index.ts", text("const a = 1;"))).toBe(true);
    expect(isTextFile("data.bin", Buffer.from([0x01, 0x00, 0x02]))).toBe(false);
  });
});

describe("isExecutable", () => {
  it("Windowsの実行ファイルの署名を見る", () => {
    expect(isExecutable("tool", Buffer.from("MZ\u0090\u0000"))).toBe(true);
  });
});
