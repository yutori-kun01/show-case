"use client";

import { useState } from "react";

/** 問題のある内容を運営に知らせるフォーム。 */
export function ReportForm({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("著作権の侵害");
  const [body, setBody] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <p className="small">
        <button type="button" className="secondary" onClick={() => setOpen(true)}>
          このページを通報する
        </button>
      </p>
    );
  }

  if (state === "done") {
    return <div className="notice ok">通報を受け付けました。ご連絡ありがとうございます。</div>;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");
    setError(null);
    const response = await fetch("/api/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, reason, body }),
    });
    if (response.ok) {
      setState("done");
      return;
    }
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    setError(payload.message ?? "送信に失敗しました");
    setState("idle");
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <h3 style={{ marginTop: 0 }}>通報</h3>
      <label htmlFor="reason">理由</label>
      <select id="reason" value={reason} onChange={(event) => setReason(event.target.value)}>
        <option>著作権の侵害</option>
        <option>個人情報が含まれている</option>
        <option>不正なコード・マルウェアの疑い</option>
        <option>その他</option>
      </select>
      <label htmlFor="body">詳しい内容</label>
      <textarea id="body" value={body} onChange={(event) => setBody(event.target.value)} required />
      {error && <div className="notice error">{error}</div>}
      <div className="row">
        <button type="submit" disabled={state === "sending"}>
          送信する
        </button>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>
          やめる
        </button>
      </div>
    </form>
  );
}
