import { env } from "@/lib/env";
import type { StorageAdapter } from "./adapter";
import { LocalStorage } from "./local";
import { R2Storage } from "./r2";
import { SupabaseStorage } from "./supabase";

let cached: StorageAdapter | null = null;

export function storage(): StorageAdapter {
  if (!cached) {
    const driver = env.storageDriver;
    cached = driver === "r2" ? new R2Storage() : driver === "supabase" ? new SupabaseStorage() : new LocalStorage();
  }
  return cached;
}

export function setStorage(adapter: StorageAdapter | null): void {
  cached = adapter;
}

export type { StorageAdapter } from "./adapter";
