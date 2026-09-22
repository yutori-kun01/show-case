import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { TableName } from "./types";
import type { DbAdapter, Row, Where } from "./adapter";

/**
 * Supabase アダプタ。サービスロールキーは運営側とジョブでのみ読み込む。
 * 公開側は公開用のビュー/匿名キー経由で読む前提のため、ここでは書き込みを含む全操作を提供する。
 */
export class SupabaseDb implements DbAdapter {
  private readonly client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client =
      client ??
      createClient(env.required("SUPABASE_URL"), env.required("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false, autoRefreshToken: false },
      });
  }

  private query<T extends TableName>(table: T, where?: Where<T>) {
    let query = this.client.from(table).select("*");
    for (const [key, value] of Object.entries(where ?? {})) {
      query = value === null ? query.is(key, null) : query.eq(key, value as never);
    }
    return query;
  }

  async select<T extends TableName>(table: T, where?: Where<T>): Promise<Row<T>[]> {
    const { data, error } = await this.query(table, where);
    if (error) throw new Error(`${table} の取得に失敗しました: ${error.message}`);
    return (data ?? []) as Row<T>[];
  }

  async findOne<T extends TableName>(table: T, where: Where<T>): Promise<Row<T> | null> {
    const rows = await this.select(table, where);
    return rows[0] ?? null;
  }

  async insert<T extends TableName>(table: T, row: Partial<Row<T>>): Promise<Row<T>> {
    const { data, error } = await this.client.from(table).insert(row as never).select("*").single();
    if (error) throw new Error(`${table} への追加に失敗しました: ${error.message}`);
    return data as Row<T>;
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>): Promise<Row<T>> {
    const { data, error } = await this.client.from(table).update(patch as never).eq("id", id).select("*").single();
    if (error) throw new Error(`${table} の更新に失敗しました: ${error.message}`);
    return data as Row<T>;
  }

  async remove<T extends TableName>(table: T, id: string): Promise<void> {
    const { error } = await this.client.from(table).delete().eq("id", id);
    if (error) throw new Error(`${table} の削除に失敗しました: ${error.message}`);
  }

  async count<T extends TableName>(table: T, where?: Where<T>): Promise<number> {
    const { data, error } = await this.query(table, where);
    if (error) throw new Error(`${table} の件数取得に失敗しました: ${error.message}`);
    return (data ?? []).length;
  }
}
