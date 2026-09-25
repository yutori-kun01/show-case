import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, setDb } from "@/lib/db";
import { LocalDb } from "@/lib/db/local";
import { setMail } from "@/lib/mail";
import { LocalMail } from "@/lib/mail/local";
import { createSessionToken, createViewerToken, readSessionToken } from "@/lib/auth/session";
import { resetAll } from "@/lib/auth/rateLimit";
import {
  AccessError,
  addViewers,
  requestAccess,
  resolveViewerAccess,
  setViewerStatus,
  siteCreator,
  updateSiteSettings,
  verifyAccess,
} from "@/lib/services/access";

let workDir: string;
let outbox: LocalMail;

/** 送られたメールの件名から確認コードを取り出す。 */
function lastCode(): string {
  const subject = outbox.sent.at(-1)?.subject ?? "";
  return subject.match(/(\d{6})/)?.[1] ?? "";
}

async function setMode(mode: "open" | "register" | "allowlist", verify = true) {
  await updateSiteSettings(await siteCreator(), { access_mode: mode, verify_email: verify });
}

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "showcase-access-"));
  setDb(new LocalDb(path.join(workDir, "db.json")));
  outbox = new LocalMail(null);
  setMail(outbox);
  resetAll();
});

afterEach(async () => {
  setDb(null);
  setMail(null);
  await fs.rm(workDir, { recursive: true, force: true });
});

describe("閲覧制限の既定値", () => {
  it("初期状態はメール登録制で、ログインしていなければ見られない", async () => {
    const access = await resolveViewerAccess(undefined);
    expect(access.mode).toBe("register");
    expect(access.allowed).toBe(false);
  });

  it("誰でも見られる設定なら、ログインなしで見られる", async () => {
    await setMode("open");
    expect((await resolveViewerAccess(undefined)).allowed).toBe(true);
  });
});

describe("メール登録制（register）", () => {
  it("コードを送り、正しいコードでログインすると閲覧者として登録される", async () => {
    const sent = await requestAccess("Student@Example.com");
    expect(sent.status).toBe("code_sent");
    expect(outbox.sent[0].to).toBe("student@example.com");

    const token = await verifyAccess("student@example.com", lastCode());
    expect((await resolveViewerAccess(token)).allowed).toBe(true);

    const viewers = await db().select("viewers");
    expect(viewers).toHaveLength(1);
    expect(viewers[0]).toMatchObject({ email: "student@example.com", source: "self", status: "active" });
    expect(viewers[0].last_login_at).not.toBeNull();
  });

  it("コードそのものはDBに保存しない", async () => {
    await requestAccess("student@example.com");
    const [row] = await db().select("access_codes");
    expect(row.code_hash).not.toContain(lastCode());
  });

  it("違うコードは通さず、5回間違えると使えなくなる", async () => {
    await requestAccess("student@example.com");
    const code = lastCode();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let index = 0; index < 5; index += 1) {
      await expect(verifyAccess("student@example.com", wrong)).rejects.toThrow("コードが違います");
    }
    await expect(verifyAccess("student@example.com", code)).rejects.toThrow("上限");
  });

  it("コードは1回しか使えず、送り直すと前のコードは無効になる", async () => {
    await requestAccess("student@example.com");
    const first = lastCode();
    await requestAccess("student@example.com");
    const second = lastCode();
    if (first !== second) {
      await expect(verifyAccess("student@example.com", first)).rejects.toBeInstanceOf(AccessError);
    }
    await verifyAccess("student@example.com", second);
    await expect(verifyAccess("student@example.com", second)).rejects.toThrow("有効期限");
  });

  it("同じメールアドレスへの連続送信を制限する", async () => {
    await requestAccess("student@example.com", "ip-a");
    await requestAccess("student@example.com", "ip-b");
    await requestAccess("student@example.com", "ip-c");
    await expect(requestAccess("student@example.com", "ip-d")).rejects.toThrow("多すぎます");
  });

  it("本人確認なしの設定なら、メールアドレスだけでログインできる", async () => {
    await setMode("register", false);
    const result = await requestAccess("student@example.com");
    expect(result.status).toBe("signed_in");
    expect(outbox.sent).toHaveLength(0);
  });
});

describe("登録済みのメールだけ（allowlist）", () => {
  beforeEach(async () => {
    await setMode("allowlist");
  });

  it("登録していないメールアドレスにはコードを送らない", async () => {
    await expect(requestAccess("stranger@example.com")).rejects.toThrow("登録されていない");
    expect(outbox.sent).toHaveLength(0);
  });

  it("運営が登録したメールアドレスならログインできる", async () => {
    const result = await addViewers(await siteCreator(), "a@example.com\nB@example.com, a@example.com\nnot-an-email");
    expect(result.added).toEqual(["a@example.com", "b@example.com"]);
    expect(result.invalid).toEqual(["not-an-email"]);

    await requestAccess("b@example.com");
    const token = await verifyAccess("b@example.com", lastCode());
    expect((await resolveViewerAccess(token)).viewer?.source).toBe("invited");
  });

  it("停止した閲覧者は、ログイン済みでもその時点で見られなくなる", async () => {
    const creator = await siteCreator();
    await addViewers(creator, "a@example.com");
    const token = createViewerToken("a@example.com");
    expect((await resolveViewerAccess(token)).allowed).toBe(true);

    const [viewer] = await db().select("viewers");
    await setViewerStatus(creator, viewer.id, "blocked");
    expect((await resolveViewerAccess(token)).allowed).toBe(false);
    await expect(requestAccess("a@example.com")).rejects.toThrow("閲覧できません");
  });
});

describe("セッションの取り違え", () => {
  it("運営側のセッション値は閲覧者として使えず、逆も同じ", async () => {
    await addViewers(await siteCreator(), "you@example.com");
    const opsToken = createSessionToken("you@example.com");
    expect((await resolveViewerAccess(opsToken)).allowed).toBe(false);
    expect(readSessionToken(createViewerToken("you@example.com"))).toBeNull();
  });
});
