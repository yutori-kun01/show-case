import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ResendMail } from "@/lib/mail/resend";

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.MAIL_FROM = "講座サポート <no-reply@example.com>";
});

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
});

describe("Resend での送信", () => {
  it("APIキーと差出人を付けて送る", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: "1" }), { status: 200 });
    }) as unknown as typeof fetch;

    await new ResendMail(fakeFetch).send({ to: "a@example.com", subject: "件名", text: "本文" });

    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer re_test_key");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      from: "講座サポート <no-reply@example.com>",
      to: ["a@example.com"],
      subject: "件名",
      text: "本文",
    });
  });

  it("失敗したら理由付きでエラーにする", async () => {
    const fakeFetch = (async () =>
      new Response('{"message":"domain is not verified"}', { status: 403 })) as unknown as typeof fetch;
    await expect(
      new ResendMail(fakeFetch).send({ to: "a@example.com", subject: "s", text: "t" }),
    ).rejects.toThrow(/403.*domain is not verified/);
  });

  it("差出人が未設定なら作れない", () => {
    delete process.env.MAIL_FROM;
    expect(() => new ResendMail()).toThrow("MAIL_FROM");
  });
});
