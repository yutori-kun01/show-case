# リポジトリショーケース（フェーズ1 MVP）

GitHubを非公開の倉庫にしたまま、選んだリポジトリだけを、履歴とAIの痕跡を消した
スナップショットとして公開・ZIP配布するプラットフォームです。
仕様は [docs/spec-phase1.md](docs/spec-phase1.md) にあります。

## すぐに動かす

認証情報がなくても、ローカル代替（JSONファイル＋ファイルシステム＋`fixtures/repos`）で一通り動きます。

```bash
npm install
cp .env.example .env.local   # OPS_BASE_PATH と OPS_DEV_PASSWORD だけ決めれば動きます
npm run seed                 # サンプルのリポジトリを取り込み、ZIPを作って公開する
npm run dev
```

- 公開側: http://localhost:3000 と http://localhost:3000/r/todo-tool
- 運営側: http://localhost:3000/<OPS_BASE_PATH>/login
  （`OPS_ALLOWED_EMAILS` のメールアドレスと `OPS_DEV_PASSWORD` でログイン）

未認証で運営側を開くと、ログイン画面ではなく404を返します。

## 構成

```
src/
  app/                     公開側（/, /r/<slug>）と運営側（/ops-internal/*）
  middleware.ts            秘匿パス・秘匿ホストから /ops-internal への書き換え
  lib/
    db/                    DBアダプタ（Supabase / ローカルJSON）
    storage/               ストレージアダプタ（Cloudflare R2 / ローカルFS）
    github/                GitHubアダプタ（GitHub App・Octokit / fixtures）
    pipeline/              除外・置換・検査・テンプレート生成・ZIP化
    services/              スナップショット、ダウンロード、マスク設定の合成など
supabase/migrations/       テーブル定義とRLS、公開用ビュー
tests/                     パイプラインと各サービスのテスト
```

外部サービスはすべてアダプタ越しに使います。環境変数が設定されていればそちらを、
なければローカル代替を選びます（運営側のホーム画面に現在の接続先が出ます）。

| 領域 | 本番 | ローカル代替 | 切り替える環境変数 |
| --- | --- | --- | --- |
| DB | Supabase | `.data/db.json` | `SUPABASE_URL`＋`SUPABASE_SERVICE_ROLE_KEY` |
| ストレージ | Cloudflare R2 | `.data/storage/` | `R2_BUCKET`＋`R2_ACCESS_KEY_ID` |
| GitHub | GitHub App / トークン | `fixtures/repos/` | `GITHUB_APP_ID` または `GITHUB_TOKEN` |

## マスク・ZIP生成パイプライン

`src/lib/pipeline/` にあります。GitHub標準のZIPは使わず、毎回作り直します。

1. **取得** — 特定コミットのtarball（`.git` を含まないため履歴と `Co-Authored-By` はここで消える）
2. **除外** — `.git/` `.github/` `.claude/` `.cursor/` `CLAUDE.md` `AGENTS.md` `.env` `.env.*`
   （`.env.example` は残す）`node_modules/`、実行ファイル・バイナリ
3. **置換** — テキストファイルのみ。GitHubユーザー名、`package.json` の
   `author`・`repository`・`bugs`・`homepage`、READMEのGitHubバッジとリンク
4. **検査** — シークレットスキャンとNGワードの照合。1件でも検出されれば公開を止める
5. **同梱** — `SETUP.md`、`.env.example`、`setup.sh`、`setup.ps1`、`AI_SETUP_PROMPT.md`
6. **保存** — ルートフォルダ名を `<slug>/`、ファイル名を `<slug>-v<版数>.zip` にしてZIP化

NGワード（`claude`、`anthropic`、`cursor`、`copilot`、`noreply` と出品者のユーザー名）は
置換せず、検出して運営が確認します。push後に自動で再公開することはありません。

## 本番に向けて

1. Supabaseでプロジェクトを作り、`supabase/migrations/0001_init.sql` を適用する
2. 運営者のアカウントをSupabase Authに作り、二要素認証を有効にして
   `OPS_ALLOWED_EMAILS` に登録する
3. R2のバケットと、画像・動画用の公開URL（`R2_PUBLIC_BASE_URL`）を用意する
4. GitHub Appを作り、権限を Contents: 読み取り と Metadata: 読み取り だけにする
5. 公開側と運営側を別プロジェクトとしてデプロイし、`OPS_HOST` か `OPS_BASE_PATH` を
   ランダムな値にする（コードにはハードコードしない）
6. ZIP生成が関数の実行時間を超える場合は、`createSnapshot()` をジョブ基盤
   （Inngest、Trigger.dev、Supabase Edge Functions）から呼ぶ

## 開発

```bash
npm run dev        # 開発サーバー
npm test           # パイプラインとサービスのテスト
npm run typecheck  # 型チェック
npm run build      # 本番ビルド
```

## フェーズ1でやっていないこと

販売・決済、コードの実行やライブデモ、他の出品者の受け入れ、READMEからのAI下書き、
アクセス解析。ダウンロードの手前には権限チェックの層（`checkEntitlement()`）を
挟んであるので、後から課金の判定を差し込めます。

未決事項（サービス名とドメイン、運営側URLの方式、ジョブ基盤、ニュースレター連携、
利用規約とプライバシーポリシーの文面）は仕様書のとおり未確定です。
