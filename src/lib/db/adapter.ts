import type { Database, TableName } from "./types";

export type Row<T extends TableName> = Database[T][number];
export type Where<T extends TableName> = Partial<Record<keyof Row<T>, unknown>>;

/**
 * DBアダプタ。ローカルのJSONストアと Supabase(Postgres) の両方が実装する。
 * 出品者ごとの分離は Supabase 側では RLS、ローカル側では creator_id の条件で行う。
 */
export interface DbAdapter {
  select<T extends TableName>(table: T, where?: Where<T>): Promise<Row<T>[]>;
  findOne<T extends TableName>(table: T, where: Where<T>): Promise<Row<T> | null>;
  insert<T extends TableName>(table: T, row: Omit<Row<T>, "id" | "created_at"> & Partial<Row<T>>): Promise<Row<T>>;
  update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>): Promise<Row<T>>;
  remove<T extends TableName>(table: T, id: string): Promise<void>;
  count<T extends TableName>(table: T, where?: Where<T>): Promise<number>;
}

export function matches<T extends TableName>(row: Row<T>, where?: Where<T>): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    const actual = (row as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) return value.includes(actual as never);
    return actual === value;
  });
}
