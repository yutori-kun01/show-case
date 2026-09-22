import { describe, expect, it } from "vitest";
import {
  renderAiSetupPrompt,
  renderEnvExample,
  renderSetupMd,
  renderSetupPs1,
  renderSetupSh,
  renderTemplates,
} from "@/lib/pipeline/templates";
import type { SetupConfig } from "@/lib/db/types";

const config: SetupConfig = {
  requirements: ["Node.js 20以上"],
  setup: "npm install",
  start: "npm run dev",
  open_url: "http://localhost:3000",
  env: [
    {
      key: "OPENAI_API_KEY",
      required: true,
      description: "OpenAIのAPIキー",
      how_to_get: "https://platform.openai.com/api-keys",
    },
  ],
};

describe("renderTemplates", () => {
  it("4種類（setupスクリプトは2つ）を生成する", () => {
    expect(renderTemplates("Todo", config).map((file) => file.path)).toEqual([
      "SETUP.md",
      ".env.example",
      "setup.sh",
      "setup.ps1",
      "AI_SETUP_PROMPT.md",
    ]);
  });

  it("setup.sh には実行権限を付ける", () => {
    const file = renderTemplates("Todo", config).find((item) => item.path === "setup.sh");
    expect(file?.mode).toBe(0o755);
  });
});

describe("SETUP.md", () => {
  it("必要な環境・コマンド・キーを含む", () => {
    const output = renderSetupMd("Todo", config);
    expect(output).toContain("Node.js 20以上");
    expect(output).toContain("npm install");
    expect(output).toContain("npm run dev");
    expect(output).toContain("OPENAI_API_KEY");
    expect(output).toContain("よくあるエラー");
  });
});

describe(".env.example", () => {
  it("値は空欄で、説明と取得先をコメントに書く", () => {
    const output = renderEnvExample(config);
    expect(output).toContain("OPENAI_API_KEY=");
    expect(output).not.toMatch(/OPENAI_API_KEY=\S/);
    expect(output).toContain("# 取得先: https://platform.openai.com/api-keys");
    expect(output).toContain("# 必須: はい");
  });
});

describe("setup スクリプト", () => {
  it("Mac・Linux 用は .env をコピーして依存関係を入れる", () => {
    const output = renderSetupSh(config);
    expect(output.startsWith("#!/usr/bin/env bash")).toBe(true);
    expect(output).toContain("cp .env.example .env");
    expect(output).toContain("npm install");
  });

  it("Windows 用は PowerShell で同じことをする", () => {
    const output = renderSetupPs1(config);
    expect(output).toContain('Copy-Item ".env.example" ".env"');
    expect(output).toContain("npm install");
  });
});

describe("AI_SETUP_PROMPT.md", () => {
  it("雛形に設定値を差し込む", () => {
    const output = renderAiSetupPrompt(config);
    expect(output).toContain("必要な環境（Node.js 20以上）");
    expect(output).toContain("npm install を実行し、npm run dev で起動してください");
    expect(output).toContain("http://localhost:3000 が開けたら完了です");
    expect(output).toContain("APIキーの値は、チャットに書き出したり外部に送信したりしないでください。");
  });
});
