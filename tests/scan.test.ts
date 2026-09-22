import { describe, expect, it } from "vitest";
import { DEFAULT_NG_WORDS, maskSecret, scanNgWords, scanSecrets } from "@/lib/pipeline/scan";

describe("scanSecrets", () => {
  it("APIキーや秘密鍵を検出する", () => {
    const findings = scanSecrets(
      "src/config.ts",
      [
        'const key = "AKIAIOSFODNN7EXAMPLE";',
        "-----BEGIN RSA PRIVATE KEY-----",
        "DATABASE_URL=postgres://user:hunter2@db.example.com:5432/app",
      ].join("\n"),
    );
    expect(findings.map((finding) => finding.rule)).toEqual(
      expect.arrayContaining(["aws-access-key", "private-key", "connection-string"]),
    );
  });

  it("検出した値はそのまま残さない", () => {
    const [finding] = scanSecrets("a.ts", 'const token = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";');
    expect(finding.excerpt).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(finding.excerpt).toContain("*");
  });

  it("プレースホルダは検出しない", () => {
    expect(scanSecrets(".env.example", "API_KEY=\nSECRET=your-secret-here")).toEqual([]);
  });

  it("マスクは前後だけ残す", () => {
    expect(maskSecret("abcd1234efgh")).toBe("abcd****efgh");
  });
});

describe("scanNgWords", () => {
  it("大文字小文字を区別せずに検出する", () => {
    const findings = scanNgWords("README.md", "Built with Claude Code", DEFAULT_NG_WORDS);
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("ngword:claude");
  });

  it("残っていなければ何も出ない", () => {
    expect(scanNgWords("README.md", "ただのTodoツールです", DEFAULT_NG_WORDS)).toEqual([]);
  });
});
