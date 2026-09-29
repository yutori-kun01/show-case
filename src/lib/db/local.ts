import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import type { Database, TableName } from "./types";
import { matches, type DbAdapter, type Row, type Where } from "./adapter";

const EMPTY: Database = {
  creators: [],
  repos: [],
  listings: [],
  mask_rules: [],
  snapshots: [],
  downloads: [],
  reports: [],
  site_settings: [],
  viewers: [],
  access_codes: [],
  app_config: [],
};

/**
 * 認証情報なしで動かすためのローカルアダプタ。単一JSONファイルに保存する。
 * 本番では Supabase アダプタを使う。
 */
export class LocalDb implements DbAdapter {
  private readonly file: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(file = path.join(env.dataDir, "db.json")) {
    this.file = file;
  }

  private async read(): Promise<Database> {
    try {
      const raw = await fs.readFile(this.file, "utf8");
      return { ...EMPTY, ...(JSON.parse(raw) as Partial<Database>) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY);
      throw error;
    }
  }

  private async write(db: Database): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
    await fs.rename(tmp, this.file);
  }

  /** 読み書きを直列化して、同時更新による取りこぼしを防ぐ。 */
  private transaction<R>(fn: (db: Database) => Promise<R> | R): Promise<R> {
    const next = this.queue.then(async () => {
      const db = await this.read();
      const before = JSON.stringify(db);
      const result = await fn(db);
      if (JSON.stringify(db) !== before) await this.write(db);
      return result;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  async select<T extends TableName>(table: T, where?: Where<T>): Promise<Row<T>[]> {
    return this.transaction((db) => (db[table] as Row<T>[]).filter((row) => matches<T>(row, where)));
  }

  async findOne<T extends TableName>(table: T, where: Where<T>): Promise<Row<T> | null> {
    const rows = await this.select(table, where);
    return rows[0] ?? null;
  }

  async insert<T extends TableName>(table: T, row: Partial<Row<T>>): Promise<Row<T>> {
    return this.transaction((db) => {
      const created = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        ...row,
      } as Row<T>;
      (db[table] as Row<T>[]).push(created);
      return created;
    });
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>): Promise<Row<T>> {
    return this.transaction((db) => {
      const rows = db[table] as Row<T>[];
      const index = rows.findIndex((row) => (row as { id: string }).id === id);
      if (index < 0) throw new Error(`${table} の ${id} が見つかりません`);
      rows[index] = { ...rows[index], ...patch };
      return rows[index];
    });
  }

  async remove<T extends TableName>(table: T, id: string): Promise<void> {
    await this.transaction((db) => {
      const rows = db[table] as Row<T>[];
      const index = rows.findIndex((row) => (row as { id: string }).id === id);
      if (index >= 0) rows.splice(index, 1);
    });
  }

  async count<T extends TableName>(table: T, where?: Where<T>): Promise<number> {
    return (await this.select(table, where)).length;
  }
}
