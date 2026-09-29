/** データモデル（仕様書「データモデル」の7テーブル＋閲覧制限の3テーブル）。 */

export type ListingStatus = "draft" | "published" | "unlisted";
export type SnapshotStatus = "pending" | "blocked" | "ready" | "published" | "archived";
export type MaskRuleKind = "exclude" | "replace" | "ngword";
export type ReportStatus = "open" | "closed";
/** open: 誰でも見られる／register: メール登録した人だけ／allowlist: 運営が登録したメールだけ */
export type AccessMode = "open" | "register" | "allowlist";
export type ViewerStatus = "active" | "blocked";
/** invited: 運営が登録した／self: 閲覧者が自分で登録した */
export type ViewerSource = "invited" | "self";

export interface Creator {
  id: string;
  display_name: string;
  /** 非公開。公開側APIでは返さない。 */
  github_login: string | null;
  github_installation_id: string | null;
  created_at: string;
}

export interface Repo {
  id: string;
  creator_id: string;
  github_repo_id: string;
  /** 非公開。公開側APIでは返さない。 */
  full_name: string;
  visibility: "public" | "private";
  default_branch: string;
  selected: boolean;
  created_at: string;
}

export interface EnvVarSpec {
  key: string;
  required: boolean;
  description: string;
  how_to_get: string;
}

export interface SetupConfig {
  requirements: string[];
  setup: string;
  start: string;
  open_url: string;
  env: EnvVarSpec[];
}

export interface DemoMedia {
  url: string;
  kind: "image" | "video";
  caption?: string;
}

export interface Listing {
  id: string;
  creator_id: string;
  repo_id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  tags: string[];
  hero_image: string | null;
  demo_media: DemoMedia[];
  setup_config: SetupConfig;
  status: ListingStatus;
  created_at: string;
  updated_at: string;
}

export interface MaskRule {
  id: string;
  creator_id: string;
  /** NULL なら全体共通のルール。 */
  listing_id: string | null;
  kind: MaskRuleKind;
  pattern: string;
  replacement: string;
  created_at: string;
}

export interface ScanFinding {
  rule: string;
  path: string;
  line: number;
  excerpt: string;
  severity: "high" | "medium";
}

export interface ScanReport {
  replacements: { pattern: string; count: number }[];
  excluded_paths: string[];
  findings: ScanFinding[];
  file_count: number;
  bytes: number;
}

export interface Snapshot {
  id: string;
  listing_id: string;
  /** 非公開。公開側APIでは返さない。 */
  commit_sha: string;
  version: number;
  zip_path: string | null;
  zip_bytes: number | null;
  scan_report: ScanReport | null;
  status: SnapshotStatus;
  created_at: string;
}

export interface Download {
  id: string;
  snapshot_id: string;
  email: string;
  consent_newsletter: boolean;
  created_at: string;
}

export interface Report {
  id: string;
  listing_id: string;
  reason: string;
  body: string;
  status: ReportStatus;
  created_at: string;
}

/** 公開側の閲覧制限の設定。出品者ごとに1行。 */
export interface SiteSettings {
  id: string;
  creator_id: string;
  access_mode: AccessMode;
  /** true ならメールに届く確認コードで本人確認する。 */
  verify_email: boolean;
  updated_at: string;
  created_at: string;
}

/** 公開側を見られるメールアドレス。 */
export interface Viewer {
  id: string;
  creator_id: string;
  email: string;
  status: ViewerStatus;
  source: ViewerSource;
  note: string;
  last_login_at: string | null;
  created_at: string;
}

/** メールで送った確認コード。コードそのものは保存せず、HMACだけを持つ。 */
export interface AccessCode {
  id: string;
  email: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  consumed_at: string | null;
  created_at: string;
}

/** 運営側の「セットアップ」画面で保存した設定。秘密の値は暗号化して入れる。 */
export interface AppConfigRow {
  id: string;
  creator_id: string;
  entries: Record<string, string>;
  updated_at: string;
  created_at: string;
}

export interface Database {
  creators: Creator[];
  repos: Repo[];
  listings: Listing[];
  mask_rules: MaskRule[];
  snapshots: Snapshot[];
  downloads: Download[];
  reports: Report[];
  site_settings: SiteSettings[];
  viewers: Viewer[];
  access_codes: AccessCode[];
  app_config: AppConfigRow[];
}

export type TableName = keyof Database;

/** 公開側に返してよい列だけを持つ形。 */
export interface PublicListing {
  slug: string;
  title: string;
  summary: string;
  description: string;
  tags: string[];
  hero_image: string | null;
  demo_media: DemoMedia[];
  requirements: string[];
  setup: string;
  start: string;
  open_url: string;
  env_keys: { key: string; required: boolean; description: string; how_to_get: string }[];
  updated_at: string;
}

export interface PublicSnapshot {
  id: string;
  version: number;
  zip_bytes: number | null;
  created_at: string;
}
