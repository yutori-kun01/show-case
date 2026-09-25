-- 公開側の閲覧制限（メール認証）。
-- 読み書きはサーバー側のサービスロールキーからだけ行うため、anon と authenticated には何も許可しない。

create table if not exists site_settings (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null unique references creators(id) on delete cascade,
  -- open: 誰でも見られる / register: メール登録した人だけ / allowlist: 運営が登録したメールだけ
  access_mode text not null default 'register'
    check (access_mode in ('open', 'register', 'allowlist')),
  verify_email boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists viewers (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  email text not null,
  status text not null default 'active' check (status in ('active', 'blocked')),
  source text not null default 'invited' check (source in ('invited', 'self')),
  note text not null default '',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  unique (creator_id, email)
);

create table if not exists access_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,         -- コードそのものは保存しない
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists access_codes_email_created_at on access_codes (email, created_at desc);

alter table site_settings enable row level security;
alter table viewers enable row level security;
alter table access_codes enable row level security;

-- ログイン中の出品者は、自分の設定と閲覧者を管理できる。確認コードは誰にも見せない。
create policy site_settings_own on site_settings
  for all to authenticated
  using (creator_id = current_creator_id()) with check (creator_id = current_creator_id());

create policy viewers_own on viewers
  for all to authenticated
  using (creator_id = current_creator_id()) with check (creator_id = current_creator_id());
