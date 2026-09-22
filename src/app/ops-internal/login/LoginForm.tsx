"use client";

import { useActionState } from "react";
import { signInAction } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(signInAction, {} as { message?: string });

  return (
    <form className="panel" action={action}>
      <label htmlFor="email">メールアドレス</label>
      <input id="email" name="email" type="email" autoComplete="username" required />
      <label htmlFor="password">パスワード</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      {state?.message && <div className="notice error">{state.message}</div>}
      <p style={{ marginBottom: 0 }}>
        <button type="submit" disabled={pending}>
          {pending ? "確認中…" : "ログイン"}
        </button>
      </p>
    </form>
  );
}
