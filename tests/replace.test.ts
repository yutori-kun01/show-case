import { describe, expect, it } from "vitest";
import {
  applyReplacements,
  stripGithubReferences,
  stripPackageJsonIdentity,
  toRegExp,
} from "@/lib/pipeline/replace";

describe("applyReplacements", () => {
  it("文字列のパターンを置き換えて件数を数える", () => {
    const result = applyReplacements("sample-owner と sample-owner", [
      { pattern: "sample-owner", replacement: "運営" },
    ]);
    expect(result.text).toBe("運営 と 運営");
    expect(result.counts).toEqual([{ pattern: "sample-owner", count: 2 }]);
  });

  it("正規表現の形式も受け付ける", () => {
    const result = applyReplacements("a1 a2", [{ pattern: "/a\\d/", replacement: "x" }]);
    expect(result.text).toBe("x x");
  });

  it("文字列パターンの記号は正規表現として解釈しない", () => {
    expect(toRegExp("a.b").test("axb")).toBe(false);
    expect(toRegExp("a.b").test("a.b")).toBe(true);
  });
});

describe("stripPackageJsonIdentity", () => {
  it("author・repository・bugs・homepage を取り除く", () => {
    const input = JSON.stringify(
      {
        name: "todo",
        author: "sample-owner <sample-owner@example.com>",
        repository: { url: "https://github.com/sample-owner/todo" },
        bugs: { url: "https://github.com/sample-owner/todo/issues" },
        homepage: "https://github.com/sample-owner/todo",
        scripts: { dev: "node index.js" },
      },
      null,
      2,
    );
    const result = stripPackageJsonIdentity(input);
    const parsed = JSON.parse(result.text) as Record<string, unknown>;
    expect(result.removed).toEqual(["author", "repository", "bugs", "homepage"]);
    expect(parsed.author).toBeUndefined();
    expect(parsed.scripts).toEqual({ dev: "node index.js" });
  });

  it("JSONとして読めないときは何もしない", () => {
    expect(stripPackageJsonIdentity("not json").text).toBe("not json");
  });
});

describe("stripGithubReferences", () => {
  it("バッジとリンクを取り除き、文言は残す", () => {
    const input = [
      "# Todo",
      "[![build](https://img.shields.io/badge/build-passing-green)](https://github.com/sample-owner/todo/actions)",
      "作者: [GitHub](https://github.com/sample-owner)",
      "課題は https://github.com/sample-owner/todo/issues へ。",
    ].join("\n");
    const result = stripGithubReferences(input);
    expect(result.text).not.toContain("github.com");
    expect(result.text).toContain("作者: GitHub");
    expect(result.count).toBeGreaterThan(0);
  });
});
