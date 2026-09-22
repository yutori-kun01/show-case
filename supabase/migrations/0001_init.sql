-- リポジトリショーケース フェーズ1 の初期スキーマ。
-- すべての主要テーブルに creator_id を持たせ、RLS で出品者ごとに分離する。

create extension if not exists "pgcrypto";

create table if not exists creators (
  id uuid primary key default gen_random_uuid(),
  -- Supabase Auth のユーザーと1対1で対応させる。
  auth_user_id uuid unique,
  display_name text not null,
  github_login text,               -- 非公開。公開側APIでは返さない
  github_installation_id text,
  created_at timestamptz not null default now()
);

create table if not exists repos (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  github_repo_id text not null,
  full_name text not null,         -- 非公開
  visibility text not null check (visibility in ('public', 'private')),
  default_branch text not null default 'main',
  selected boolean not null default false,
  created_at timestamptz not null default now(),
  unique (creator_id, github_repo_id)
);

create table if not exists listings (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  repo_id uuid not null references repos(id) on delete cascade,
  slug text not null unique,
  title text not null default '',
  summary text not null default '',
  description text not null default '',
  tags text[] not null default '{}',
  hero_image text,
  demo_media jsonb not null default '[]'::jsonb,
  setup_config jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'unlisted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mask_rules (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  listing_id uuid references listings(id) on delete cascade,  -- NULL なら全体共通
  kind text not null check (kind in ('exclude', 'replace', 'ngword')),
  pattern text not null,
  replacement text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists snapshots (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  commit_sha text not null,        -- 非公開
  version integer not null,
  zip_path text,
  zip_bytes bigint,
  scan_report jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'blocked', 'ready', 'published', 'archived')),
  created_at timestamptz not null default now(),
  unique (listing_id, version)
);

-- 公開中の版は1つだけ。
create unique index if not exists snapshots_one_published
  on snapshots (listing_id) where (status = 'published');

create table if not exists downloads (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references snapshots(id) on delete cascade,
  email text not null,
  consent_newsletter boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists downloads_email_created_at on downloads (email, created_at desc);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  reason text not null,
  body text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

-- ここから RLS。サービスロールキー（運営側とジョブ）は RLS を迂回する。
alter table creators enable row level security;
alter table repos enable row level security;
alter table listings enable row level security;
alter table mask_rules enable row level security;
alter table snapshots enable row level security;
alter table downloads enable row level security;
alter table reports enable row level security;

-- ログイン中の出品者が自分の行だけを読み書きできるようにする。
create or replace function current_creator_id() returns uuid
language sql stable as $$
  select id from creators where auth_user_id = auth.uid()
$$;

create policy creators_self on creators
  for all to authenticated
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

create policy repos_own on repos
  for all to authenticated
  using (creator_id = current_creator_id()) with check (creator_id = current_creator_id());

create policy listings_own on listings
  for all to authenticated
  using (creator_id = current_creator_id()) with check (creator_id = current_creator_id());

create policy mask_rules_own on mask_rules
  for all to authenticated
  using (creator_id = current_creator_id()) with check (creator_id = current_creator_id());

create policy snapshots_own on snapshots
  for all to authenticated
  using (listing_id in (select id from listings where creator_id = current_creator_id()))
  with check (listing_id in (select id from listings where creator_id = current_creator_id()));

create policy downloads_own on downloads
  for select to authenticated
  using (snapshot_id in (
    select s.id from snapshots s
    join listings l on l.id = s.listing_id
    where l.creator_id = current_creator_id()
  ));

create policy reports_own on reports
  for all to authenticated
  using (listing_id in (select id from listings where creator_id = current_creator_id()))
  with check (listing_id in (select id from listings where creator_id = current_creator_id()));

-- 公開側（anon）は、公開中の listing の表示用の列だけを見る。
-- github_login・full_name・commit_sha は含めない。
create or replace view public_listings
with (security_invoker = true) as
  select
    l.slug,
    l.title,
    l.summary,
    l.description,
    l.tags,
    l.hero_image,
    l.demo_media,
    l.setup_config,
    l.updated_at
  from listings l
  where l.status = 'published';

create or replace view public_snapshots
with (security_invoker = true) as
  select
    s.id,
    l.slug,
    s.version,
    s.zip_bytes,
    s.created_at
  from snapshots s
  join listings l on l.id = s.listing_id
  where s.status = 'published' and l.status = 'published';

create policy listings_public_read on listings
  for select to anon using (status = 'published');

create policy snapshots_public_read on snapshots
  for select to anon
  using (status = 'published'
    and listing_id in (select id from listings where status = 'published'));

-- 通報とメール登録は匿名でも書き込めるが、読み取りはできない。
create policy reports_public_insert on reports for insert to anon with check (true);
create policy downloads_public_insert on downloads for insert to anon with check (true);

grant select on public_listings, public_snapshots to anon;
