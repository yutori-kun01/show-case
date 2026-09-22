import type { SetupConfig } from "@/lib/db/types";

/** セットアップテンプレートの生成（仕様書「セットアップテンプレート」）。 */

export interface GeneratedFile {
  path: string;
  content: string;
  /** setup.sh に実行権限を付ける。 */
  mode?: number;
}

function requirementList(config: SetupConfig): string {
  return config.requirements.length > 0
    ? config.requirements.map((item) => `- ${item}`).join("\n")
    : "- 特になし";
}

function envRows(config: SetupConfig): string {
  if (config.env.length === 0) return "このプロジェクトに設定が必要なキーはありません。\n";
  return [
    "| キー | 必須 | 説明 | 取得先 |",
    "| --- | --- | --- | --- |",
    ...config.env.map(
      (item) =>
        `| \`${item.key}\` | ${item.required ? "必須" : "任意"} | ${item.description || "-"} | ${item.how_to_get || "-"} |`,
    ),
  ].join("\n");
}

export function renderSetupMd(title: string, config: SetupConfig): string {
  return `# ${title} のセットアップ手順

このフォルダをローカルで動かすための手順です。順番どおりに進めてください。
自分で進めるのが難しいときは、同梱の \`AI_SETUP_PROMPT.md\` をAIエディターに貼ってください。

## 1. 必要な環境

${requirementList(config)}

## 2. 設定ファイルを用意する

\`.env.example\` をコピーして \`.env\` という名前で保存します。

\`\`\`bash
cp .env.example .env
\`\`\`

Windowsのコマンドプロンプトでは \`copy .env.example .env\` です。

${envRows(config)}

## 3. インストール

\`\`\`bash
${config.setup || "# セットアップコマンドはありません"}
\`\`\`

Mac・Linuxでは \`./setup.sh\`、Windowsでは \`./setup.ps1\` を実行すると、環境の確認からここまでをまとめて行えます。

## 4. 起動

\`\`\`bash
${config.start || "# 起動コマンドはありません"}
\`\`\`

${config.open_url ? `起動したらブラウザで ${config.open_url} を開きます。` : ""}

## 5. よくあるエラー

| 症状 | 対処 |
| --- | --- |
| \`command not found\` と出る | 「必要な環境」が入っていません。1に戻ってインストールしてください |
| キーが見つからない・認証に失敗する | \`.env\` のキー名と値を確認してください。値の前後に空白や引用符が入っていないか見ます |
| ポートが使用中と出る | 同じポートで別のアプリが動いています。そのアプリを終了するか、ポート番号を変更してください |
| インストールが途中で止まる | ネットワークを確認し、もう一度インストールコマンドを実行してください |
`;
}

export function renderEnvExample(config: SetupConfig): string {
  if (config.env.length === 0) return "# このプロジェクトで設定が必要なキーはありません\n";
  const blocks = config.env.map((item) => {
    const lines = [
      `# ${item.description || item.key}`,
      `# 必須: ${item.required ? "はい" : "いいえ"}`,
    ];
    if (item.how_to_get) lines.push(`# 取得先: ${item.how_to_get}`);
    lines.push(`${item.key}=`);
    return lines.join("\n");
  });
  return `# このファイルをコピーして .env を作り、値を書き込んでください。\n# 値は絶対に共有しないでください。\n\n${blocks.join("\n\n")}\n`;
}

export function renderSetupSh(config: SetupConfig): string {
  const checks = config.requirements
    .map((requirement) => `echo "  - ${requirement.replace(/"/g, '\\"')}"`)
    .join("\n");
  return `#!/usr/bin/env bash
# Mac・Linux 用のセットアップ。実行するには: bash setup.sh
set -euo pipefail

echo "必要な環境を確認します。"
${checks || 'echo "  - 特になし"'}

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo ".env を作成しました。値を書き込んでください。"
  fi
else
  echo ".env はすでにあります。上書きしません。"
fi

echo "依存関係をインストールします。"
${config.setup || 'echo "インストールする依存関係はありません。"'}

echo ""
echo "セットアップが終わりました。"
echo "起動するには: ${config.start || "(起動コマンドの指定はありません)"}"
${config.open_url ? `echo "起動後にブラウザで開く: ${config.open_url}"` : ""}
`;
}

export function renderSetupPs1(config: SetupConfig): string {
  const checks = config.requirements
    .map((requirement) => `Write-Host "  - ${requirement.replace(/"/g, '`"')}"`)
    .join("\n");
  return `# Windows 用のセットアップ。実行するには: powershell -ExecutionPolicy Bypass -File setup.ps1
$ErrorActionPreference = "Stop"

Write-Host "必要な環境を確認します。"
${checks || 'Write-Host "  - 特になし"'}

if (-Not (Test-Path ".env")) {
  if (Test-Path ".env.example") {
    Copy-Item ".env.example" ".env"
    Write-Host ".env を作成しました。値を書き込んでください。"
  }
} else {
  Write-Host ".env はすでにあります。上書きしません。"
}

Write-Host "依存関係をインストールします。"
${config.setup || 'Write-Host "インストールする依存関係はありません。"'}

Write-Host ""
Write-Host "セットアップが終わりました。"
Write-Host "起動するには: ${config.start || "(起動コマンドの指定はありません)"}"
${config.open_url ? `Write-Host "起動後にブラウザで開く: ${config.open_url}"` : ""}
`;
}

export function renderAiSetupPrompt(config: SetupConfig): string {
  const requirements = config.requirements.join("、") || "特になし";
  return `このフォルダのプロジェクトをローカルで動かしたいです。
SETUP.md と .env.example を読んで、次の順に進めてください。
1. 必要な環境（${requirements}）が入っているか確認し、なければ入れ方を教えてください
2. .env.example を .env にコピーしてください
3. 各キーの取得方法を1つずつ案内し、私が値を入力するのを待ってください
4. ${config.setup || "（インストールは不要です）"} を実行し、${config.start || "（起動コマンドはありません）"} で起動してください
5. ${config.open_url || "起動したページ"} が開けたら完了です。エラーが出たら原因と対処を説明してください
APIキーの値は、チャットに書き出したり外部に送信したりしないでください。
`;
}

/** ZIPのルートに同梱する4種類（setupスクリプトは2つ）のファイル。 */
export function renderTemplates(title: string, config: SetupConfig): GeneratedFile[] {
  return [
    { path: "SETUP.md", content: renderSetupMd(title, config) },
    { path: ".env.example", content: renderEnvExample(config) },
    { path: "setup.sh", content: renderSetupSh(config), mode: 0o755 },
    { path: "setup.ps1", content: renderSetupPs1(config) },
    { path: "AI_SETUP_PROMPT.md", content: renderAiSetupPrompt(config) },
  ];
}

export const EMPTY_SETUP_CONFIG: SetupConfig = {
  requirements: [],
  setup: "",
  start: "",
  open_url: "",
  env: [],
};
