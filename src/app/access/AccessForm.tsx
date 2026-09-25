"use client";

import { useActionState } from "react";
import { accessAction, type AccessFormState } from "./actions";

interface Props {
  next: string;
  mode: "register" | "allowlist";
  verify: boolean;
}

export function AccessForm({ next, mode, verify }: Props) {
  const [state, formAction, pending] = useActionState<AccessFormState, FormData>(accessAction, {
    step: "email",
    email: "",
  });

  if (state.step === "code") {
    return (
      <form className="panel" action={formAction}>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="email" value={state.email} />
        <p style={{ marginTop: 0 }}>
          <strong>{state.email}</strong> に6桁の確認コードを送りました。届いたコードを入力してください。
        </p>
        {state.devCode && (
          <div className="notice ok">開発用の表示: コードは {state.devCode} です（メール送信を設定すると出なくなります）</div>
        )}
        <label htmlFor="code">確認コード</label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          autoFocus
        />
        {state.message && <div className="notice error">{state.message}</div>}
        <div className="row" style={{ marginTop: 14 }}>
          <button type="submit" name="intent" value="verify" disabled={pending}>
            {pending ? "確認中…" : "ログインする"}
          </button>
          <button type="submit" name="intent" value="send" className="secondary" disabled={pending} formNoValidate>
            コードを送り直す
          </button>
          <button type="submit" name="intent" value="restart" className="secondary" disabled={pending} formNoValidate>
            メールアドレスを変える
          </button>
        </div>
        <p className="small muted">届かないときは、迷惑メールフォルダも確認してください。</p>
      </form>
    );
  }

  return (
    <form className="panel" action={formAction}>
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="intent" value="send" />
      <p style={{ marginTop: 0 }}>
        {mode === "allowlist"
          ? "登録済みのメールアドレスを入力してください。"
          : "メールアドレスを登録すると、公開中のツールを見られます。"}
        {verify && " 確認コードをメールでお送りします。"}
      </p>
      <label htmlFor="email">メールアドレス</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.email}
        placeholder="you@example.com"
        autoFocus
      />
      {state.message && <div className="notice error">{state.message}</div>}
      <p style={{ marginBottom: 0 }}>
        <button type="submit" disabled={pending}>
          {pending ? "送信中…" : verify ? "確認コードを送る" : "見る"}
        </button>
      </p>
    </form>
  );
}
