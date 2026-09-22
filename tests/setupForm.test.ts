import { describe, expect, it } from "vitest";
import {
  formatEnvSpecs,
  parseDemoMedia,
  parseEnvSpecs,
  parseSetupConfig,
  parseTags,
  toSlug,
} from "@/lib/services/setupForm";

describe("parseEnvSpecs", () => {
  it("1行1件で読み取る", () => {
    const specs = parseEnvSpecs(
      "OPENAI_API_KEY | 必須 | OpenAIのAPIキー | https://platform.openai.com/api-keys\nPORT | 任意 | ポート番号 |",
    );
    expect(specs).toEqual([
      {
        key: "OPENAI_API_KEY",
        required: true,
        description: "OpenAIのAPIキー",
        how_to_get: "https://platform.openai.com/api-keys",
      },
      { key: "PORT", required: false, description: "ポート番号", how_to_get: "" },
    ]);
  });

  it("書式に戻せる", () => {
    const input = "PORT | 任意 | ポート番号 | ";
    expect(formatEnvSpecs(parseEnvSpecs(input))).toBe("PORT | 任意 | ポート番号 | ");
  });
});

describe("parseDemoMedia", () => {
  it("種別を image か video に寄せる", () => {
    expect(parseDemoMedia("https://x/y.mp4 | video | デモ\nhttps://x/z.png")).toEqual([
      { url: "https://x/y.mp4", kind: "video", caption: "デモ" },
      { url: "https://x/z.png", kind: "image", caption: "" },
    ]);
  });
});

describe("parseTags", () => {
  it("カンマ・読点・改行で区切る", () => {
    expect(parseTags("CLI、メモ, 自動化\n検索")).toEqual(["CLI", "メモ", "自動化", "検索"]);
  });
});

describe("toSlug", () => {
  it("URLに使える形にする", () => {
    expect(toSlug("Todo Tool v2")).toBe("todo-tool-v2");
    expect(toSlug("--変換-- ")).toBe("");
  });
});

describe("parseSetupConfig", () => {
  it("フォームの値をまとめる", () => {
    expect(
      parseSetupConfig({
        requirements: "Node.js 20以上\n\nGit",
        setup: " npm install ",
        start: "npm run dev",
        open_url: "http://localhost:3000",
        env: "KEY | 必須 | 説明 | https://example.com",
      }),
    ).toEqual({
      requirements: ["Node.js 20以上", "Git"],
      setup: "npm install",
      start: "npm run dev",
      open_url: "http://localhost:3000",
      env: [{ key: "KEY", required: true, description: "説明", how_to_get: "https://example.com" }],
    });
  });
});
