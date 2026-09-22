import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="container" style={{ maxWidth: 420 }}>
      <h1>ログイン</h1>
      <LoginForm />
    </main>
  );
}
