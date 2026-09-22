import { beforeEach, describe, expect, it } from "vitest";
import { createSessionToken, readSessionToken } from "@/lib/auth/session";
import { clearFailures, isLocked, registerFailure, resetAll } from "@/lib/auth/rateLimit";
import { sign, verify } from "@/lib/storage/signing";

describe("セッション", () => {
  it("署名が合えば読み取れる", () => {
    const token = createSessionToken("You@Example.com");
    expect(readSessionToken(token)?.email).toBe("you@example.com");
  });

  it("改ざんされた値は受け付けない", () => {
    const token = createSessionToken("you@example.com");
    const [body] = token.split(".");
    expect(readSessionToken(`${body}.invalidsignature`)).toBeNull();
    expect(readSessionToken(undefined)).toBeNull();
  });

  it("期限が切れていれば無効", () => {
    const token = createSessionToken("you@example.com", Date.now() - 1000 * 60 * 60 * 24);
    expect(readSessionToken(token)).toBeNull();
  });
});

describe("ログイン試行回数の制限", () => {
  beforeEach(() => resetAll());

  it("5回失敗すると止める", () => {
    for (let index = 0; index < 4; index += 1) registerFailure("ip:you@example.com");
    expect(isLocked("ip:you@example.com")).toBe(false);
    registerFailure("ip:you@example.com");
    expect(isLocked("ip:you@example.com")).toBe(true);
  });

  it("成功すれば数え直す", () => {
    for (let index = 0; index < 5; index += 1) registerFailure("ip:you@example.com");
    clearFailures("ip:you@example.com");
    expect(isLocked("ip:you@example.com")).toBe(false);
  });

  it("時間が経てば解ける", () => {
    const now = Date.now();
    for (let index = 0; index < 5; index += 1) registerFailure("ip:you@example.com", now);
    expect(isLocked("ip:you@example.com", now + 16 * 60 * 1000)).toBe(false);
  });
});

describe("ダウンロードURLの署名", () => {
  it("期限内で署名が合えば通す", () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 600;
    expect(verify("snapshots/a/a-v1.zip", expiresAt, sign("snapshots/a/a-v1.zip", expiresAt))).toBe(true);
  });

  it("期限切れと改ざんは通さない", () => {
    const past = Math.floor(Date.now() / 1000) - 1;
    expect(verify("k", past, sign("k", past))).toBe(false);
    const future = Math.floor(Date.now() / 1000) + 600;
    expect(verify("k", future, sign("other", future))).toBe(false);
  });
});
