/**
 * ログイン試行回数の制限。フェーズ1は単一インスタンス前提のメモリ保持。
 * 複数インスタンスで動かすときは Supabase のテーブルか Redis に移す。
 */
const attempts = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function registerFailure(key: string, now = Date.now()): void {
  const current = attempts.get(key);
  if (!current || now - current.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now });
    return;
  }
  current.count += 1;
}

export function isLocked(key: string, now = Date.now()): boolean {
  const current = attempts.get(key);
  if (!current) return false;
  if (now - current.firstAt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return current.count >= MAX_ATTEMPTS;
}

export function clearFailures(key: string): void {
  attempts.delete(key);
}

export function resetAll(): void {
  attempts.clear();
}
