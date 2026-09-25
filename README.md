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
  （初期設定は「メール登録した人だけ」。メール送信が未設定のあいだは、確認コードが画面とコンソールに出ます）
- 運営側: http://localhost:3000/<OPS_BASE_PATH>/login
  （`OPS_ALLOWED_EMAILS` のメールアドレスと `OPS_DEV_PASSWORD` でログイン）

未認証で運営側を開くと、ログイン画面ではなく404を返します。

## 閲覧者のログイン（メール認証）

公開側のURLを受講者などに共有し、ログインした人だけに見せます。運営側の「閲覧者」画面で設定します。

| 設定 | 見られる人 |
| --- | --- |
| 誰でも見られる | 全員（ダウンロード時だけメールアドレスを入力） |
| メール登録した人だけ | メールアドレスを登録した人。登録は誰でもでき、一覧に自動で追加される |
| 登録済みのメールアドレスだけ | 運営が一覧に登録したメールアドレスだけ（受講者に限定するならこれ） |

- 「6桁のコードで本人確認する」をオンにすると、メールに届くコードで本人確認します（コードの有効期限は10分、5回まで）。
  オフにすると、メールアドレスを入れるだけで入れます
- 一覧ではメールアドレスをまとめて貼り付けて登録でき、個別に停止・削除できます。
  停止した人は、ログイン済みでも次のページ表示から見られなくなります
- ログインの有効期間は `VIEWER_SESSION_DAYS`（既定30日）です

## 構成

```
src/
  app/                     公開側（/, /r/<slug>, /access）と運営側（/ops-internal/*）
  middleware.ts            秘匿パス・秘匿ホストから /ops-internal への書き換え
  lib/
    db/                    DBアダプタ（Supabase / ローカルJSON）
    storage/               ストレージアダプタ（Cloudflare R2 / ローカルFS）
    github/                GitHubアダプタ（GitHub App・Octokit / fixtures）
    mail/                  メール送信アダプタ（SMTP / ローカル）
    pipeline/              除外・置換・検査・テンプレート生成・ZIP化
    services/              スナップショット、ダウンロード、閲覧制限、マスク設定の合成など
supabase/migrations/       テーブル定義とRLS、公開用ビュー
tests/                     パイプラインと各サービスのテスト
```

外部サービスはすべてアダプタ越しに使います。環境変数が設定されていればそちらを、
なければローカル代替を選びます（運営側のホーム画面に現在の接続先が出ます）。

| 領域 | 本番 | ローカル代替 | 切り替える環境変数 |
| --- | --- | --- | --- |
| DB | Supabase | `.data/db.json` | `SUPABASE_URL`＋`SUPABASE_SERVICE_ROLE_KEY` |
| ストレージ | Cloudflare R2 | `.data/storage/` | `R2_BUCKET`＋`R2_ACCESS_KEY_ID` |
| ストレージ（別案） | Supabase Storage | 〃 | `SUPABASE_STORAGE_BUCKET`（Supabase 設定時） |
| GitHub | GitHub App / トークン | `fixtures/repos/` | `GITHUB_APP_ID` または `GITHUB_TOKEN` |
| メール | SMTP（Gmail など） | コンソールと `.data/mail.log` | `SMTP_HOST` |

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

## ほぼ無料で運用する構成（個人向け）

運営は自分1人、閲覧者は講座の受講者、という規模なら次の組み合わせで無料枠に収まります。
料金とプランは変わるので、始める前に各サービスのページで確認してください。

| 役割 | サービス | メモ |
| --- | --- | --- |
| 公開側のホスティング | Netlify（Free） | 商用利用できる。月の上限を超えると止まるだけで、請求は来ない |
| DB＋ファイル置き場 | Supabase（Free）＋ Supabase Storage | DB 500MB・ファイル 1GB。7日間アクセスがないと一時停止する（下記） |
| メール送信 | Gmail の SMTP（アプリパスワード） | 独自ドメイン不要。1日500通まで |
| 運営側 | 自分のPC（`npm run dev`） | ZIP生成に時間がかかっても平気で、GitHubトークンをサーバーに置かずに済む |

Vercel の Hobby プランは非商用に限られます。講座（有料）の受講者向けなら Netlify を使うか、Vercel Pro にしてください。

### 手順

1. **Supabase** でプロジェクトを作り、SQL Editor で `supabase/migrations/0001_init.sql` と
   `0002_viewer_access.sql` を順に実行する。Storage で**非公開**のバケット（例: `showcase`）を作る
2. **Gmail** で2段階認証を有効にし、アプリパスワードを発行する
3. 自分のPCの `.env.local` に、Supabase（`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`SUPABASE_STORAGE_BUCKET`）、
   `GITHUB_TOKEN`、SMTP、`OPS_SESSION_SECRET`、`DOWNLOAD_SIGNING_SECRET` を設定して `npm run dev` で運営する
4. **Netlify** にこのリポジトリをつなぎ、同じ環境変数に加えて `OPS_DISABLED=1` と `SITE_URL` を設定してデプロイする。
   `GITHUB_TOKEN` は公開側に置かない。`OPS_SESSION_SECRET` と `DOWNLOAD_SIGNING_SECRET` は PC と同じ値にする
   （本番でこの2つが未設定だとエラーで止まる）
5. 運営側の「閲覧者」画面で「登録済みのメールアドレスだけ」を選び、受講者のメールアドレスを貼り付けて、公開側のURLを共有する

**Supabase の一時停止対策**: `.github/workflows/keepalive.yml` が3日おきに `/api/health` を叩きます。
GitHub のリポジトリ設定で Actions の変数 `SITE_URL` を登録すると動きます
（GitHub は、リポジトリに60日間動きがないと定期実行を止めるので、ときどき確認してください）。

## 本番に向けて（大きめの構成）

1. Supabaseでプロジェクトを作り、`supabase/migrations/` のSQLを番号順に適用する
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
