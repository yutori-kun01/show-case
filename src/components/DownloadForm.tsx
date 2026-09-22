"use client";

import { useState } from "react";

interface Props {
  slug: string;
  version: number;
}

/**
 * メールアドレスを登録すると、有効期限付きの署名付きURLを受け取る。
 * ニュースレターの同意は未チェックが初期値。
 */
export function DownloadForm({ slug, version }: Props) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [grant, setGrant] = useState<{ url: string; fileName: string; expiresInSeconds: number } | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");
    setError(null);
    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, email, consent_newsletter: consent }),
      });
      const payload = (await response.json()) as { url?: string; fileName?: string; expiresInSeconds?: number; message?: string };
      if (!response.ok || !payload.url) {
        setError(payload.message ?? "ダウンロードの準備に失敗しました");
        setState("idle");
        return;
      }
      setGrant({ url: payload.url, fileName: payload.fileName ?? "", expiresInSeconds: payload.expiresInSeconds ?? 600 });
      setState("done");
    } catch {
      setError("通信に失敗しました。時間をおいてお試しください");
      setState("idle");
    }
  }

  if (state === "done" && grant) {
    return (
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>ダウンロードの準備ができました</h2>
        <p className="small muted">
          リンクの有効期限は約{Math.round(grant.expiresInSeconds / 60)}分です。期限が切れたら、もう一度登録してください。
        </p>
        <p>
          <a className="button" href={grant.url} download={grant.fileName}>
            {grant.fileName} をダウンロード
          </a>
        </p>
      </div>
    );
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <h2 style={{ marginTop: 0 }}>ダウンロード（第{version}版）</h2>
      <p className="small muted">
        メールアドレスを登録すると、有効期限付きのリンクをその場でお渡しします。
      </p>
      <label htmlFor="email">メールアドレス</label>
      <input
        id="email"
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
      />
      <div className="checkbox">
        <input
          id="consent"
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
        />
        <label htmlFor="consent" style={{ margin: 0, color: "inherit" }}>
          新しいツールのお知らせ（ニュースレター）を受け取る
        </label>
      </div>
      {error && <div className="notice error">{error}</div>}
      <button type="submit" disabled={state === "sending"}>
        {state === "sending" ? "準備中…" : "ダウンロードする"}
      </button>
    </form>
  );
}
