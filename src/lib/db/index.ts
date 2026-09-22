import { env } from "@/lib/env";
import type { DbAdapter } from "./adapter";
import { LocalDb } from "./local";
import { SupabaseDb } from "./supabase";

let cached: DbAdapter | null = null;

/** 環境変数に応じて Supabase かローカルJSONを選ぶ。 */
export function db(): DbAdapter {
  if (!cached) cached = env.dbDriver === "supabase" ? new SupabaseDb() : new LocalDb();
  return cached;
}

/** テスト用に差し替える。 */
export function setDb(adapter: DbAdapter | null): void {
  cached = adapter;
}

export * from "./types";
export type { DbAdapter, Row, Where } from "./adapter";
