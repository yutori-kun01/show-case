import crypto from "node:crypto";
import { db } from "@/lib/db";
import type { AccessMode, Creator, SiteSettings, Viewer, ViewerStatus } from "@/lib/db/types";
import { env } from "@/lib/env";
import { getConfig } from "@/lib/config";
import { mail } from "@/lib/mail";
import { createViewerToken, readViewerToken } from "@/lib/auth/session";
import { isLocked, registerFailure } from "@/lib/auth/rateLimit";
import { siteCreator } from "./creator";

/**
 * 公開側の閲覧制限。
 * - open: 誰でも見られる
 * - register: メールアドレスを登録した人だけ（登録は誰でもできる）
 * - allowlist: 運営が登録したメールアドレスだけ
 * verify_email が true なら、メールに届く6桁のコードで本人確認する。
 */

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
/** 同じメールアドレスに送れるコードの数（15分あたり）。 */
const CODES_PER_EMAIL = 3;
const CODE_WINDOW_MS = 15 * 60 * 1000;

export const DEFAULT_SETTINGS: Pick<SiteSettings, "access_mode" | "verify_email"> = {
  access_mode: "register",
  verify_email: true,
};

export class AccessError extends Error {}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export { siteCreator };

export async function getSiteSettings(creator?: Creator): Promise<SiteSettings> {
  const owner = creator ?? (await siteCreator());
  const existing = await db().findOne("site_settings", { creator_id: owner.id });
  if (existing) return existing;
  return db().insert("site_settings", {
    creator_id: owner.id,
    ...DEFAULT_SETTINGS,
    updated_at: new Date().toISOString(),
  });
}

export async function updateSiteSettings(
  creator: Creator,
  patch: { access_mode: AccessMode; verify_email: boolean },
): Promise<SiteSettings> {
  const current = await getSiteSettings(creator);
  return db().update("site_settings", current.id, { ...patch, updated_at: new Date().toISOString() });
}

// ---------------------------------------------------------------------------
// 閲覧者のログイン
// ---------------------------------------------------------------------------

export type AccessRequestResult =
  | { status: "code_sent"; email: string; devCode?: string }
  | { status: "signed_in"; token: string };

/** メールアドレスを受け取り、コードを送るか、確認なしの設定ならその場でログインさせる。 */
export async function requestAccess(rawEmail: string, ip = "unknown"): Promise<AccessRequestResult> {
  const email = normalizeEmail(rawEmail);
  if (!EMAIL.test(email)) throw new AccessError("メールアドレスの形式が正しくありません");

  const creator = await siteCreator();
  const settings = await getSiteSettings(creator);
  if (settings.access_mode === "open") throw new AccessError("このサイトはログインなしで見られます");
  await assertMayEnter(creator, settings, email);

  if (!settings.verify_email) {
    return { status: "signed_in", token: await completeSignIn(creator, settings, email) };
  }

  const ipKey = `access-code:${ip}`;
  if (isLocked(ipKey)) throw new AccessError("短時間の送信が多すぎます。しばらく待ってからお試しください");
  const recent = (await db().select("access_codes", { email })).filter(
    (row) => Date.parse(row.created_at) >= Date.now() - CODE_WINDOW_MS,
  );
  if (recent.length >= CODES_PER_EMAIL) {
    throw new AccessError("短時間の送信が多すぎます。しばらく待ってからお試しください");
  }
  registerFailure(ipKey);

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  // 以前に送った未使用のコードは無効にする。
  for (const row of recent) {
    if (!row.consumed_at) await db().update("access_codes", row.id, { consumed_at: new Date().toISOString() });
  }
  await db().insert("access_codes", {
    email,
    code_hash: hashCode(email, code),
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    attempts: 0,
    consumed_at: null,
  });

  const config = await getConfig(creator);
  await (await mail()).send({
    to: email,
    subject: `【${config.siteName}】確認コード ${code}`,
    text: [
      `${config.siteName} の確認コードです。`,
      "",
      `  ${code}`,
      "",
      "ログイン画面にこの6桁の数字を入力してください。有効期限は10分です。",
      config.siteUrl ? `\n${config.siteUrl}/access` : "",
      "心当たりがない場合は、このメールを破棄してください。",
    ].join("\n"),
  });

  // ローカル代替のメールは届かないため、開発中だけ画面にコードを出す。
  const devCode = config.mailDriver === "local" && !env.isProduction ? code : undefined;
  return { status: "code_sent", email, devCode };
}

/** 確認コードを照合し、合っていればセッション値を返す。 */
export async function verifyAccess(rawEmail: string, rawCode: string): Promise<string> {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.replace(/\s/g, "");
  const now = Date.now();

  const candidates = (await db().select("access_codes", { email }))
    .filter((row) => !row.consumed_at && Date.parse(row.expires_at) > now)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const current = candidates[0];
  if (!current) throw new AccessError("コードの有効期限が切れています。もう一度送ってください");
  if (current.attempts >= CODE_MAX_ATTEMPTS) {
    throw new AccessError("入力の回数が上限に達しました。もう一度コードを送ってください");
  }

  const expected = Buffer.from(current.code_hash);
  const provided = Buffer.from(hashCode(email, code));
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    await db().update("access_codes", current.id, { attempts: current.attempts + 1 });
    throw new AccessError("コードが違います");
  }
  await db().update("access_codes", current.id, { consumed_at: new Date().toISOString() });

  const creator = await siteCreator();
  const settings = await getSiteSettings(creator);
  // コードを送ってから確認するまでの間に、運営が止めた場合を考えて入り直しを確かめる。
  await assertMayEnter(creator, settings, email);
  return completeSignIn(creator, settings, email);
}

export interface ViewerAccess {
  mode: AccessMode;
  /** 見てよいかどうか。open なら常に true。 */
  allowed: boolean;
  viewer: Viewer | null;
}

/** Cookie のセッション値から、いま見てよいかを判断する。止められた閲覧者はその時点で見られなくなる。 */
export async function resolveViewerAccess(token: string | undefined): Promise<ViewerAccess> {
  const creator = await siteCreator();
  const settings = await getSiteSettings(creator);
  const session = readViewerToken(token);
  const viewer = session
    ? await db().findOne("viewers", { creator_id: creator.id, email: session.email })
    : null;
  const active = viewer && viewer.status === "active" ? viewer : null;
  return {
    mode: settings.access_mode,
    allowed: settings.access_mode === "open" || Boolean(active),
    viewer: active,
  };
}

async function assertMayEnter(creator: Creator, settings: SiteSettings, email: string): Promise<void> {
  const viewer = await db().findOne("viewers", { creator_id: creator.id, email });
  if (viewer?.status === "blocked") throw new AccessError("このメールアドレスでは閲覧できません");
  if (settings.access_mode === "allowlist" && !viewer) {
    throw new AccessError("登録されていないメールアドレスです。運営に登録したメールアドレスを入力してください");
  }
}

async function completeSignIn(creator: Creator, settings: SiteSettings, email: string): Promise<string> {
  const now = new Date().toISOString();
  const viewer = await db().findOne("viewers", { creator_id: creator.id, email });
  if (viewer) {
    await db().update("viewers", viewer.id, { last_login_at: now });
  } else if (settings.access_mode === "register") {
    await db().insert("viewers", {
      creator_id: creator.id,
      email,
      status: "active",
      source: "self",
      note: "",
      last_login_at: now,
    });
  } else {
    throw new AccessError("登録されていないメールアドレスです");
  }
  const { viewerSessionDays } = await getConfig(creator);
  return createViewerToken(email, viewerSessionDays * 24 * 60 * 60);
}

function hashCode(email: string, code: string): string {
  return crypto.createHmac("sha256", env.sessionSecret).update(`code:${email}:${code}`).digest("base64url");
}

// ---------------------------------------------------------------------------
// 運営側の閲覧者管理
// ---------------------------------------------------------------------------

export interface AddViewersResult {
  added: string[];
  existing: string[];
  invalid: string[];
}

/** 改行・カンマ・空白区切りのメールアドレスをまとめて登録する。 */
export async function addViewers(creator: Creator, text: string, note = ""): Promise<AddViewersResult> {
  const result: AddViewersResult = { added: [], existing: [], invalid: [] };
  const seen = new Set<string>();
  for (const raw of text.split(/[\s,;、]+/)) {
    const email = normalizeEmail(raw);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (!EMAIL.test(email)) {
      result.invalid.push(raw.trim());
      continue;
    }
    if (await db().findOne("viewers", { creator_id: creator.id, email })) {
      result.existing.push(email);
      continue;
    }
    await db().insert("viewers", {
      creator_id: creator.id,
      email,
      status: "active",
      source: "invited",
      note: note.trim(),
      last_login_at: null,
    });
    result.added.push(email);
  }
  return result;
}

export async function setViewerStatus(creator: Creator, viewerId: string, status: ViewerStatus): Promise<void> {
  const viewer = await db().findOne("viewers", { id: viewerId, creator_id: creator.id });
  if (viewer) await db().update("viewers", viewer.id, { status });
}

export async function removeViewer(creator: Creator, viewerId: string): Promise<void> {
  const viewer = await db().findOne("viewers", { id: viewerId, creator_id: creator.id });
  if (viewer) await db().remove("viewers", viewer.id);
}
