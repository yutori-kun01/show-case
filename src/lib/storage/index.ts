import { env } from "@/lib/env";
import type { StorageAdapter } from "./adapter";
import { LocalStorage } from "./local";
import { R2Storage } from "./r2";

let cached: StorageAdapter | null = null;

export function storage(): StorageAdapter {
  if (!cached) cached = env.storageDriver === "r2" ? new R2Storage() : new LocalStorage();
  return cached;
}

export function setStorage(adapter: StorageAdapter | null): void {
  cached = adapter;
}

export type { StorageAdapter } from "./adapter";
