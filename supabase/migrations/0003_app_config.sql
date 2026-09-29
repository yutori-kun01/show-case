-- 運営側の「セットアップ」画面で保存する設定（Resend のキー、GitHub のトークンなど）。
-- 秘密の値はアプリ側で暗号化してから入れる。読み書きはサービスロールキーからだけ行う。

create table if not exists app_config (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null unique references creators(id) on delete cascade,
  entries jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- anon と authenticated には何も許可しない（ポリシーなし）。
alter table app_config enable row level security;
